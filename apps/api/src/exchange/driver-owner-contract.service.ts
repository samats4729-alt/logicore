import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_SIZE } from '../documents/allowed-files';
import { decodeUploadName } from '../common/utils/upload-name';
import { removeExchangeFile, safeExtension, storeExchangeFile } from './exchange-files';
import { DriverOwnerContractDto } from './dto/vehicle-owner-contract.dto';
import { ParkContractContent } from './park-contract';
import { renderParkContractPdf } from './park-contract-pdf';
import {
    buildDriverOwnerContract, DRIVER_OWNER_CONTRACT_VERSION, DriverOwnerContractInput, driverOwnerContractGaps, driverOwnerContractNumber,
} from './driver-owner-contract';

/** Ссылка на PDF для браузера телефона живёт десять минут — как у договора с парком. */
const LINK_TTL_MS = 10 * 60 * 1000;

const DRIVER_SELECT = {
    id: true, kind: true, parkCompanyId: true, lastName: true, firstName: true, middleName: true, iin: true,
    idNumber: true, idIssuedBy: true, idIssuedAt: true, registrationAddress: true, phone: true,
    vehicleModel: true, vehiclePlate: true, vehicleRegNumber: true, vehicleIsOwn: true, vehicleOwnerIin: true,
} satisfies Prisma.ExchangeDriverSelect;

type DriverRow = Prisma.ExchangeDriverGetPayload<{ select: typeof DRIVER_SELECT }>;

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Что водитель видит в приложении о своём договоре с хозяином машины. */
const VIEW_SELECT = {
    id: true, number: true, status: true, ownerKind: true, ownerName: true, ownerIinBin: true, ownerIdNumber: true,
    ownerIdIssuedBy: true, ownerIdIssuedAt: true, ownerAddress: true, ownerPhone: true, ownerSigner: true,
    rentAmount: true, rentBasis: true, signedAt: true, signedFileName: true, createdAt: true,
} satisfies Prisma.ExchangeVehicleOwnerContractSelect;

type ViewRow = Prisma.ExchangeVehicleOwnerContractGetPayload<{ select: typeof VIEW_SELECT }>;

/**
 * Договор водителя с хозяином машины (владелец, 31.10.2026): «парк
 * составляет договор с водителем, а водитель — с хозяином машины, чтобы,
 * если что, парк был ни при чём».
 *
 * Водитель заполняет данные хозяина в приложении, открывает PDF, они
 * подписывают на бумаге, водитель присылает фото. Нужен только тем, у кого
 * машина не своя: по ИИН собственника из техпаспорта система понимает это
 * сама (`vehicleIsOwn`). Лежит в той же таблице, что и прежние договоры
 * парка с владельцами, с отметкой `lessee = DRIVER`; парк видит его в
 * карточке водителя, но не правит — он не сторона.
 */
@Injectable()
export class DriverOwnerContractService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
        private readonly config: ConfigService,
    ) {}

    private async me(userId: string): Promise<DriverRow> {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: DRIVER_SELECT });
        if (!driver || driver.kind !== 'PARK' || !driver.parkCompanyId) {
            throw new NotFoundException('Договор с хозяином машины — для водителей, которые работают через парк');
        }
        return driver;
    }

    private latest(driverId: string) {
        return this.prisma.exchangeVehicleOwnerContract.findFirst({
            where: { driverId, lessee: 'DRIVER' },
            orderBy: { createdAt: 'desc' },
            select: { ...VIEW_SELECT, content: true, signedFileUrl: true },
        });
    }

    /** Данные для текста: что вписал водитель о хозяине, машина и сам водитель — из анкеты. */
    private input(driver: DriverRow, number: string, date: Date, row: {
        ownerKind: string; ownerName: string; ownerIinBin: string | null; ownerIdNumber: string | null; ownerIdIssuedBy: string | null;
        ownerIdIssuedAt: Date | null; ownerAddress: string | null; ownerPhone: string | null; ownerSigner: string | null;
        rentAmount: number | null; rentBasis: string | null;
    }): DriverOwnerContractInput {
        const person = row.ownerKind !== 'COMPANY';
        return {
            number,
            date,
            owner: {
                kind: person ? 'PERSON' : 'COMPANY',
                name: row.ownerName,
                iinBin: row.ownerIinBin,
                idNumber: person ? row.ownerIdNumber : null,
                idIssuedBy: person ? row.ownerIdIssuedBy : null,
                idIssuedAt: person ? row.ownerIdIssuedAt : null,
                address: row.ownerAddress,
                phone: row.ownerPhone,
                iban: null, bank: null, bankBic: null,
                signer: person ? null : row.ownerSigner,
            },
            vehicle: { model: driver.vehicleModel, plate: driver.vehiclePlate, regNumber: driver.vehicleRegNumber },
            driver: {
                lastName: driver.lastName, firstName: driver.firstName, middleName: driver.middleName, iin: driver.iin,
                idNumber: driver.idNumber, idIssuedBy: driver.idIssuedBy, idIssuedAt: driver.idIssuedAt,
                registrationAddress: driver.registrationAddress, phone: driver.phone, payoutIban: null, payoutBank: null,
            },
            rent: row.rentAmount && row.rentAmount > 0 && (row.rentBasis === 'TRIP' || row.rentBasis === 'MONTH')
                ? { amount: row.rentAmount, basis: row.rentBasis }
                : null,
        };
    }

    private fromDto(dto: DriverOwnerContractDto) {
        const person = dto.ownerKind !== 'COMPANY';
        return {
            ownerKind: dto.ownerKind, ownerName: dto.ownerName.trim(), ownerIinBin: clean(dto.ownerIinBin),
            ownerIdNumber: person ? clean(dto.ownerIdNumber) : null,
            ownerIdIssuedBy: person ? clean(dto.ownerIdIssuedBy) : null,
            ownerIdIssuedAt: person && dto.ownerIdIssuedAt ? new Date(`${dto.ownerIdIssuedAt.slice(0, 10)}T00:00:00Z`) : null,
            ownerAddress: clean(dto.ownerAddress), ownerPhone: clean(dto.ownerPhone),
            ownerSigner: person ? null : clean(dto.ownerSigner),
            rentAmount: dto.rentAmount && dto.rentAmount > 0 ? dto.rentAmount : null,
            rentBasis: dto.rentAmount && dto.rentAmount > 0 ? (dto.rentBasis ?? 'MONTH') : null,
        };
    }

    /** Плата в базе: «не указана» — ноль и NONE (поле обязательное с прежних договоров парка). */
    private static rentOf(row: { rentAmount: Prisma.Decimal | number; rentBasis: string }) {
        const amount = Number(row.rentAmount);
        return amount > 0 && row.rentBasis !== 'NONE' ? { rentAmount: amount, rentBasis: row.rentBasis } : { rentAmount: null, rentBasis: null };
    }

    private view(row: ViewRow, driver: DriverRow) {
        const rent = DriverOwnerContractService.rentOf(row);
        const gaps = row.status === 'SIGNED' ? [] : driverOwnerContractGaps(this.input(driver, row.number, row.createdAt, { ...row, ...rent }));
        return { ...row, ...rent, gaps };
    }

    /** Нужен ли договор и что уже есть — для экрана «Мои документы». */
    async mine(userId: string) {
        const driver = await this.me(userId);
        const row = await this.latest(driver.id);
        return {
            // Своя машина — договор с хозяином не нужен, приложение его и не показывает.
            needed: !driver.vehicleIsOwn,
            ownerIin: driver.vehicleOwnerIin,
            contract: row ? this.view(row, driver) : null,
        };
    }

    /**
     * Сохранить данные хозяина. Пока не подписан — правится тот же договор
     * (номер и дата прежние); подписанный не меняется — новые данные значат
     * новый договор.
     */
    async save(userId: string, dto: DriverOwnerContractDto) {
        const driver = await this.me(userId);
        if (driver.vehicleIsOwn) {
            throw new BadRequestException('По техпаспорту машина ваша — договор с хозяином не нужен');
        }
        const data = this.fromDto(dto);
        const last = await this.latest(driver.id);
        const draft = last && last.status !== 'SIGNED' ? last : null;
        const date = draft?.createdAt ?? new Date();
        const number = draft?.number ?? driverOwnerContractNumber(randomBytes(4).toString('hex'), date);
        const input = this.input(driver, number, date, data);
        const fields = {
            ...data,
            rentAmount: new Prisma.Decimal(data.rentAmount ?? 0),
            rentBasis: data.rentBasis ?? 'NONE',
            vehicleModel: driver.vehicleModel, vehiclePlate: driver.vehiclePlate ?? '', vehicleRegNumber: driver.vehicleRegNumber,
            version: DRIVER_OWNER_CONTRACT_VERSION,
            content: buildDriverOwnerContract(input) as unknown as Prisma.InputJsonValue,
        };
        const row = draft
            ? await this.prisma.exchangeVehicleOwnerContract.update({ where: { id: draft.id }, data: fields, select: VIEW_SELECT })
            : await this.prisma.exchangeVehicleOwnerContract.create({
                data: { ...fields, parkCompanyId: driver.parkCompanyId!, driverId: driver.id, number, status: 'DRAFT', lessee: 'DRIVER', createdById: userId },
                select: VIEW_SELECT,
            });
        return this.view(row, driver);
    }

    /**
     * Текст для печати. До подписи собирается заново: водитель мог поправить
     * анкету (удостоверение, адрес). С пробелами вместо ИИН и техпаспорта
     * печатать нечего — такой договор ничего не подтверждает.
     */
    private async contentFor(row: NonNullable<Awaited<ReturnType<DriverOwnerContractService['latest']>>>, driver: DriverRow) {
        if (row.status === 'SIGNED') return row.content as unknown as ParkContractContent;
        const input = this.input(driver, row.number, row.createdAt, { ...row, ...DriverOwnerContractService.rentOf(row) });
        const gaps = driverOwnerContractGaps(input);
        if (gaps.length) throw new BadRequestException(`Для договора не хватает: ${gaps.join(', ')}`);
        const content = buildDriverOwnerContract(input);
        await this.prisma.exchangeVehicleOwnerContract.update({ where: { id: row.id }, data: { content: content as unknown as Prisma.InputJsonValue } });
        return content;
    }

    /** Ссылка на PDF на десять минут — открыть в браузере телефона и распечатать. */
    async link(userId: string): Promise<{ path: string; expiresAt: Date }> {
        const driver = await this.me(userId);
        const row = await this.latest(driver.id);
        if (!row) throw new NotFoundException('Сначала впишите данные хозяина машины');
        await this.contentFor(row, driver);
        const expires = Date.now() + LINK_TTL_MS;
        const payload = `${row.id}.${expires}`;
        return { path: `/exchange/owner-contract-pdf/${payload}.${this.sign(payload)}`, expiresAt: new Date(expires) };
    }

    /** PDF по подписанной ссылке. Неверная или просроченная — «не найдено», без подробностей. */
    async pdfByLink(token: string) {
        const [id, expires, mac] = String(token).split('.');
        const payload = `${id}.${expires}`;
        const expected = this.sign(payload);
        const valid = !!id && !!mac && mac.length === expected.length
            && timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
            && Number(expires) > Date.now();
        const row = valid ? await this.prisma.exchangeVehicleOwnerContract.findFirst({ where: { id, lessee: 'DRIVER' }, select: { number: true, content: true } }) : null;
        if (!row) throw new NotFoundException('Ссылка устарела — откройте договор в приложении ещё раз');
        // Печати парка нет: парк не сторона этого договора.
        return { number: row.number, pdf: await renderParkContractPdf(row.content as unknown as ParkContractContent, null, { stamp: null, signature: null }) };
    }

    /** Фото или скан подписанного договора. Новое фото заменяет прежнее, текст не меняется. */
    async attachSigned(userId: string, file: Express.Multer.File | undefined) {
        if (!file) throw new BadRequestException('Приложите фото подписанного договора');
        if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
            throw new BadRequestException('Подойдёт фотография (JPG, PNG, HEIC, WebP) или PDF подписанного договора');
        }
        if (file.size > MAX_UPLOAD_SIZE) throw new BadRequestException('Файл больше 15 МБ — сфотографируйте заново');
        const driver = await this.me(userId);
        const row = await this.latest(driver.id);
        if (!row) throw new NotFoundException('Сначала впишите данные хозяина машины');
        // Подписывали то, что напечатали: печатается только полный договор.
        const content = await this.contentFor(row, driver);
        const key = `uploads/exchange/owner-contracts/${driver.parkCompanyId}/${row.id}_${Date.now()}${safeExtension(file.originalname)}`;
        await storeExchangeFile(this.s3, key, file);
        const updated = await this.prisma.exchangeVehicleOwnerContract.update({
            where: { id: row.id },
            data: {
                status: 'SIGNED', content: content as unknown as Prisma.InputJsonValue,
                signedFileUrl: key, signedFileName: decodeUploadName(file.originalname), signedFileMime: file.mimetype, signedFileSize: file.size,
                signedAt: row.signedAt ?? new Date(),
            },
            select: VIEW_SELECT,
        });
        if (row.signedFileUrl) await removeExchangeFile(this.s3, row.signedFileUrl);
        return this.view(updated, driver);
    }

    private sign(payload: string): string {
        const secret = this.config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET environment variable is not configured');
        return createHmac('sha256', `owner-contract:${secret}`).update(payload).digest('base64url');
    }
}
