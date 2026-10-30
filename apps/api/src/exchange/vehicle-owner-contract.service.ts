import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { StampImageService } from '../common/services/stamp-image.service';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_SIZE } from '../documents/allowed-files';
import { decodeUploadName } from '../common/utils/upload-name';
import { normalizePlate } from './driver-identity';
import { ParkContractContent } from './park-contract';
import { renderParkContractPdf } from './park-contract-pdf';
import { removeExchangeFile, safeExtension, storeExchangeFile } from './exchange-files';
import {
    buildVehicleOwnerContract, ownerContractGaps, OwnerKind, RentBasis,
    VehicleOwnerContractInput, VEHICLE_OWNER_CONTRACT_VERSION,
} from './vehicle-owner-contract';
import { VehicleOwnerContractDto } from './dto/vehicle-owner-contract.dto';

const PARK_REQUISITES = {
    name: true, bin: true, address: true, directorName: true, bankAccount: true, bankName: true, bankBic: true, kbe: true, phone: true,
} as const;

/** Что видит парк в списке: без текста договора — он нужен только для PDF. */
const LIST_SELECT = {
    id: true, number: true, version: true, status: true, driverId: true, lessee: true,
    ownerKind: true, ownerName: true, ownerIinBin: true, ownerIdNumber: true, ownerIdIssuedBy: true, ownerIdIssuedAt: true,
    ownerAddress: true, ownerPhone: true, ownerIban: true, ownerBank: true, ownerBankBic: true, ownerSigner: true,
    vehicleModel: true, vehiclePlate: true, vehicleRegNumber: true, rentAmount: true, rentBasis: true,
    signedFileName: true, signedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ExchangeVehicleOwnerContractSelect;

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Договоры парка с владельцами машин (задачи шефа, Q9).
 *
 * Водитель ездит на чужой машине — парк арендует её у владельца. Владельца в
 * LogiCore нет, поэтому порядок такой: парк вносит данные владельца, машины
 * и арендную плату → скачивает PDF → стороны подписывают на бумаге → парк
 * прикладывает скан. После этого договор не правится: в нём то, что
 * подписали, а новые условия — новый договор.
 *
 * Видит и правит только парк водителя: у другого парка тот же адрес
 * отвечает «не найдено».
 */
@Injectable()
export class VehicleOwnerContractService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
        private readonly stamps: StampImageService,
    ) {}

    private async parkDriver(parkId: string, driverId: string) {
        const driver = await this.prisma.exchangeDriver.findFirst({
            where: { id: driverId, parkCompanyId: parkId },
            select: { id: true, lastName: true, firstName: true, middleName: true, iin: true, vehicleIsOwn: true, vehiclePlate: true, vehicleModel: true, vehicleRegNumber: true },
        });
        if (!driver) throw new NotFoundException('Водитель не найден');
        return driver;
    }

    private async own(parkId: string, id: string) {
        const row = await this.prisma.exchangeVehicleOwnerContract.findFirst({ where: { id, parkCompanyId: parkId } });
        if (!row) throw new NotFoundException('Договор не найден');
        return row;
    }

    /** Данные для текста: что внёс парк, реквизиты парка на сегодня, водитель. */
    private async input(parkId: string, driver: Awaited<ReturnType<VehicleOwnerContractService['parkDriver']>>, number: string, date: Date, dto: VehicleOwnerContractDto): Promise<VehicleOwnerContractInput> {
        const park = await this.prisma.company.findUnique({ where: { id: parkId }, select: PARK_REQUISITES });
        if (!park) throw new NotFoundException('Парк не найден');
        return {
            number,
            date,
            park,
            owner: {
                kind: dto.ownerKind as OwnerKind,
                name: dto.ownerName.trim(),
                iinBin: clean(dto.ownerIinBin),
                idNumber: dto.ownerKind === 'PERSON' ? clean(dto.ownerIdNumber) : null,
                idIssuedBy: dto.ownerKind === 'PERSON' ? clean(dto.ownerIdIssuedBy) : null,
                idIssuedAt: dto.ownerKind === 'PERSON' && dto.ownerIdIssuedAt ? new Date(`${dto.ownerIdIssuedAt.slice(0, 10)}T00:00:00Z`) : null,
                address: clean(dto.ownerAddress),
                phone: clean(dto.ownerPhone),
                iban: clean(dto.ownerIban),
                bank: clean(dto.ownerBank),
                bankBic: dto.ownerKind === 'COMPANY' ? clean(dto.ownerBankBic) : null,
                signer: dto.ownerKind === 'COMPANY' ? clean(dto.ownerSigner) : null,
            },
            vehicle: { model: clean(dto.vehicleModel), plate: normalizePlate(dto.vehiclePlate) || null, regNumber: clean(dto.vehicleRegNumber) },
            driver: { name: [driver.lastName, driver.firstName, driver.middleName].filter(Boolean).join(' '), iin: driver.iin },
            rent: { amount: Number(dto.rentAmount), basis: dto.rentBasis as RentBasis },
        };
    }

    private fields(input: VehicleOwnerContractInput) {
        const o = input.owner;
        return {
            ownerKind: o.kind, ownerName: o.name, ownerIinBin: o.iinBin, ownerIdNumber: o.idNumber, ownerIdIssuedBy: o.idIssuedBy,
            ownerIdIssuedAt: o.idIssuedAt, ownerAddress: o.address, ownerPhone: o.phone, ownerIban: o.iban, ownerBank: o.bank,
            ownerBankBic: o.bankBic, ownerSigner: o.signer,
            vehicleModel: input.vehicle.model, vehiclePlate: input.vehicle.plate ?? '', vehicleRegNumber: input.vehicle.regNumber,
            rentAmount: new Prisma.Decimal(input.rent.amount), rentBasis: input.rent.basis,
        };
    }

    /** Чего не хватает для подписи — пересчитывается по текущим реквизитам парка. */
    private async gapsOf(parkId: string, row: { content: unknown; status: string; driverId: string } & Record<string, any>) {
        // Договор водителя с хозяином заполняет водитель — пробелы видит он в приложении.
        if (row.status === 'SIGNED' || row.lessee === 'DRIVER') return [] as string[];
        const driver = await this.parkDriver(parkId, row.driverId);
        const input = await this.input(parkId, driver, row.number, row.createdAt, this.dtoOf(row));
        return ownerContractGaps(input);
    }

    private dtoOf(row: Record<string, any>): VehicleOwnerContractDto {
        return {
            ownerKind: row.ownerKind, ownerName: row.ownerName, ownerIinBin: row.ownerIinBin, ownerIdNumber: row.ownerIdNumber,
            ownerIdIssuedBy: row.ownerIdIssuedBy, ownerIdIssuedAt: row.ownerIdIssuedAt ? new Date(row.ownerIdIssuedAt).toISOString().slice(0, 10) : null,
            ownerAddress: row.ownerAddress, ownerPhone: row.ownerPhone, ownerIban: row.ownerIban, ownerBank: row.ownerBank,
            ownerBankBic: row.ownerBankBic, ownerSigner: row.ownerSigner, vehicleModel: row.vehicleModel, vehiclePlate: row.vehiclePlate,
            vehicleRegNumber: row.vehicleRegNumber, rentAmount: Number(row.rentAmount), rentBasis: row.rentBasis,
        };
    }

    /** Договоры с владельцами по водителю — для карточки водителя в кабинете парка. */
    async list(parkId: string, driverId: string) {
        const driver = await this.parkDriver(parkId, driverId);
        const rows = await this.prisma.exchangeVehicleOwnerContract.findMany({
            where: { driverId, parkCompanyId: parkId },
            select: { ...LIST_SELECT, content: true },
            orderBy: { createdAt: 'desc' },
        });
        const items = await Promise.all(rows.map(async ({ content, ...row }) => ({
            ...row,
            // У договора водителя с хозяином плату могли не вписать — тогда её нет.
            rentAmount: row.rentBasis === 'NONE' ? null : Number(row.rentAmount),
            gaps: row.status === 'SIGNED' || row.lessee === 'DRIVER' ? [] : ownerContractGaps(await this.input(parkId, driver, row.number, row.createdAt, this.dtoOf(row))),
        })));
        return {
            // Машина из анкеты — чтобы форма открывалась уже с ней.
            vehicle: { model: driver.vehicleModel, plate: driver.vehiclePlate, regNumber: driver.vehicleRegNumber, isOwn: driver.vehicleIsOwn },
            items,
        };
    }

    /**
     * Новый договор «парк арендует машину у хозяина» больше не заводится
     * (владелец, 31.10.2026): машину у хозяина арендует сам водитель, парк в
     * этом договоре не участвует и аренду не платит. Водитель составляет его в
     * приложении (`DriverOwnerContractService`); прежние договоры парка
     * остаются, их черновики правятся и подписываются как раньше.
     */
    async create(_parkId: string, _userId: string | null, _driverId: string, _dto: VehicleOwnerContractDto): Promise<never> {
        throw new BadRequestException('Договор с хозяином машины теперь составляет сам водитель в приложении — парк в нём не участвует и аренду не платит.');
    }

    /** Правка до подписи: текст собирается заново, номер и дата оформления — прежние. */
    async update(parkId: string, id: string, dto: VehicleOwnerContractDto) {
        const row = await this.own(parkId, id);
        if (row.lessee === 'DRIVER') {
            throw new BadRequestException('Этот договор водитель составил с хозяином машины — парк его не правит.');
        }
        if (row.status === 'SIGNED') {
            throw new BadRequestException('Договор уже подписан — его текст не меняется. Новые условия — новый договор.');
        }
        const driver = await this.parkDriver(parkId, row.driverId);
        const input = await this.input(parkId, driver, row.number, row.createdAt, dto);
        const updated = await this.prisma.exchangeVehicleOwnerContract.update({
            where: { id },
            data: {
                ...this.fields(input),
                version: VEHICLE_OWNER_CONTRACT_VERSION,
                content: buildVehicleOwnerContract(input) as unknown as Prisma.InputJsonValue,
            },
            select: LIST_SELECT,
        });
        return { ...updated, rentAmount: Number(updated.rentAmount), gaps: ownerContractGaps(input) };
    }

    /**
     * PDF для подписи (или подписанного текста). До подписи текст собирается
     * заново — реквизиты парка могли поменяться после оформления; с
     * прочерками вместо ИИН и техпаспорта печатать нечего.
     */
    async pdf(parkId: string, id: string) {
        const row = await this.own(parkId, id);
        let content = row.content as unknown as ParkContractContent;
        // Договор водителя с хозяином — как его собрал водитель, без печати
        // парка: парк не сторона.
        if (row.lessee === 'DRIVER') {
            return { number: row.number, pdf: await renderParkContractPdf(content, null, { stamp: null, signature: null }) };
        }
        if (row.status !== 'SIGNED') {
            const driver = await this.parkDriver(parkId, row.driverId);
            const input = await this.input(parkId, driver, row.number, row.createdAt, this.dtoOf(row));
            const gaps = ownerContractGaps(input);
            if (gaps.length) throw new BadRequestException(`Для договора не хватает: ${gaps.join(', ')}`);
            content = buildVehicleOwnerContract(input);
            await this.prisma.exchangeVehicleOwnerContract.update({ where: { id }, data: { content: content as unknown as Prisma.InputJsonValue } });
        }
        const park = await this.prisma.company.findUnique({ where: { id: parkId }, select: { id: true, stampImage: true, signatureImage: true } });
        const images = await this.stamps.loadFor(park, true);
        return { number: row.number, pdf: await renderParkContractPdf(content, null, images) };
    }

    /**
     * Приложить подписанный скан. С ним договор считается подписанным и
     * больше не правится; новый скан заменяет прежний (переснятый, без
     * обрезанной подписи), текст при этом не меняется.
     */
    async attachSigned(parkId: string, id: string, file: Express.Multer.File | undefined) {
        if (!file) throw new BadRequestException('Приложите файл');
        if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
            throw new BadRequestException('Подойдёт PDF или фотография (JPG, PNG, HEIC, WebP) подписанного договора');
        }
        if (file.size > MAX_UPLOAD_SIZE) throw new BadRequestException('Файл больше 15 МБ — сожмите или отсканируйте заново');
        const row = await this.own(parkId, id);
        if (row.status !== 'SIGNED') {
            // Подписывали то, что напечатали: печатается только полный договор.
            const gaps = await this.gapsOf(parkId, row);
            if (gaps.length) throw new BadRequestException(`Договор ещё не готов к подписи — не хватает: ${gaps.join(', ')}`);
        }
        const key = `uploads/exchange/owner-contracts/${parkId}/${id}_${Date.now()}${safeExtension(file.originalname)}`;
        await storeExchangeFile(this.s3, key, file);
        const updated = await this.prisma.exchangeVehicleOwnerContract.update({
            where: { id },
            data: {
                status: 'SIGNED',
                signedFileUrl: key, signedFileName: decodeUploadName(file.originalname), signedFileMime: file.mimetype, signedFileSize: file.size,
                signedAt: row.signedAt ?? new Date(),
            },
            select: LIST_SELECT,
        });
        if (row.signedFileUrl) await removeExchangeFile(this.s3, row.signedFileUrl);
        return { ...updated, rentAmount: updated.rentBasis === 'NONE' ? null : Number(updated.rentAmount), gaps: [] as string[] };
    }

    async signedFile(parkId: string, id: string) {
        const row = await this.own(parkId, id);
        if (!row.signedFileUrl) throw new NotFoundException('Подписанный договор ещё не приложен');
        return { fileKey: row.signedFileUrl, fileName: row.signedFileName || `Договор ${row.number}`, mimeType: row.signedFileMime || 'application/octet-stream' };
    }
}
