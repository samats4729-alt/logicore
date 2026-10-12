import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StampImageService } from '../common/services/stamp-image.service';
import {
    buildParkContract, contractGaps, contractNumber, ParkContractContent, ParkContractInput,
} from './park-contract';
import { renderParkContractPdf } from './park-contract-pdf';

/** Доля парка по умолчанию — та же, что у выплат, пока парк не задал свою. */
/** Ссылка на PDF для приложения живёт десять минут: открыть — да, пересылать — нет. */
const LINK_TTL_MS = 10 * 60 * 1000;

const DRIVER_FOR_CONTRACT = {
    id: true, kind: true, parkCompanyId: true,
    lastName: true, firstName: true, middleName: true, iin: true, phone: true,
    idNumber: true, idIssuedBy: true, idIssuedAt: true, registrationAddress: true,
    vehiclePlate: true, vehicleModel: true, vehicleRegNumber: true, vehicleBodyType: true, vehicleCapacityKg: true, vehicleIsOwn: true,
    payoutIban: true, payoutBank: true,
} as const;

const CONTRACT_SELECT = {
    id: true, number: true, version: true, content: true, signedAt: true, signedDevice: true, signedIp: true, parkCompanyId: true,
} as const;

/**
 * Договор водителя с парком: собрать из анкеты и кабинета парка, показать
 * до подписи, заморозить при подписи, выдать PDF обеим сторонам.
 *
 * Подписанный экземпляр не пересобирается из текущих данных: в нём ровно
 * то, что водитель прочёл и подписал (`ExchangeDriverContract.content`).
 */
@Injectable()
export class ParkContractService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly stamps: StampImageService,
        private readonly config: ConfigService,
    ) {}

    /** Данные для договора на сегодня: анкета и реквизиты парка. */
    async inputFor(driverId: string, at: Date): Promise<ParkContractInput | null> {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { id: driverId }, select: DRIVER_FOR_CONTRACT });
        if (!driver || driver.kind !== 'PARK' || !driver.parkCompanyId) return null;
        const park = await this.prisma.company.findUnique({
            where: { id: driver.parkCompanyId },
            select: { name: true, bin: true, address: true, directorName: true, bankAccount: true, bankName: true, bankBic: true, kbe: true, phone: true },
        });
        if (!park) return null;
        return {
            number: contractNumber(driver.id, at),
            date: at,
            park,
            driver: {
                lastName: driver.lastName, firstName: driver.firstName, middleName: driver.middleName,
                iin: driver.iin, idNumber: driver.idNumber, idIssuedBy: driver.idIssuedBy, idIssuedAt: driver.idIssuedAt,
                registrationAddress: driver.registrationAddress, phone: driver.phone,
                payoutIban: driver.payoutIban, payoutBank: driver.payoutBank,
            },
            vehicle: {
                model: driver.vehicleModel, plate: driver.vehiclePlate, regNumber: driver.vehicleRegNumber,
                bodyType: driver.vehicleBodyType, capacityKg: driver.vehicleCapacityKg, isOwn: driver.vehicleIsOwn,
            },
        };
    }

    /** Последний подписанный экземпляр с нынешним парком водителя. */
    async latestSigned(driverId: string, parkCompanyId: string | null) {
        if (!parkCompanyId) return null;
        return this.prisma.exchangeDriverContract.findFirst({
            where: { driverId, parkCompanyId },
            orderBy: { signedAt: 'desc' },
            select: CONTRACT_SELECT,
        });
    }

    /**
     * Что видит водитель на шаге «Договор»: подписанный экземпляр, если он
     * есть, иначе — текст, который он сейчас подпишет, и чего не хватает.
     */
    async forDriver(driverId: string, parkCompanyId: string | null, contractSignedAt: Date | null) {
        const signed = contractSignedAt ? await this.latestSigned(driverId, parkCompanyId) : null;
        if (signed) return { signed: this.view(signed), draft: null, gaps: [] as string[] };
        const input = await this.inputFor(driverId, new Date());
        if (!input) return { signed: null, draft: null, gaps: ['выберите парк — договор подписывается с ним'] };
        return { signed: null, draft: buildParkContract(input), gaps: contractGaps(input) };
    }

    /**
     * Текст для подписи. Не хватает данных — подписывать нечего: договор с
     * прочерками вместо БИН и адреса ничего не стоит ни парку, ни водителю.
     */
    async contentToSign(driverId: string, at: Date): Promise<ParkContractContent> {
        const input = await this.inputFor(driverId, at);
        if (!input) throw new BadRequestException('Сначала выберите парк — договор подписывается с ним');
        const gaps = contractGaps(input);
        if (gaps.length) throw new BadRequestException(`Для договора не хватает: ${gaps.join(', ')}`);
        return buildParkContract(input);
    }

    /** PDF подписанного экземпляра — печать и подпись парка из его кабинета. */
    async pdf(contract: { content: unknown; signedAt: Date; signedDevice: string | null; signedIp: string | null; parkCompanyId: string }) {
        const park = await this.prisma.company.findUnique({
            where: { id: contract.parkCompanyId },
            select: { id: true, stampImage: true, signatureImage: true },
        });
        const images = await this.stamps.loadFor(park, true);
        return renderParkContractPdf(
            contract.content as ParkContractContent,
            { signedAt: contract.signedAt, device: contract.signedDevice, ip: contract.signedIp },
            images,
        );
    }

    /** PDF своего договора — водителю. */
    async driverPdf(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: { id: true, parkCompanyId: true } });
        const contract = driver && await this.latestSigned(driver.id, driver.parkCompanyId);
        if (!contract) throw new NotFoundException('Договор ещё не подписан');
        return { number: contract.number, pdf: await this.pdf(contract) };
    }

    /** PDF договора своего водителя — парку. Чужой водитель — «не найден». */
    async parkPdf(companyId: string, driverId: string) {
        const driver = await this.prisma.exchangeDriver.findFirst({ where: { id: driverId, parkCompanyId: companyId }, select: { id: true } });
        const contract = driver && await this.latestSigned(driver.id, companyId);
        if (!contract) throw new NotFoundException('Договор ещё не подписан');
        return { number: contract.number, pdf: await this.pdf(contract) };
    }

    /** Краткие сведения для карточек: номер и когда подписан. */
    view(c: { id: string; number: string; version: string; content: unknown; signedAt: Date }) {
        return { id: c.id, number: c.number, version: c.version, signedAt: c.signedAt, content: c.content as ParkContractContent };
    }

    // ==================== ссылка на PDF для приложения ====================

    /**
     * Ссылка на PDF своего договора — открыть в браузере телефона.
     *
     * Приложение не умеет показывать PDF само, а браузер не пошлёт пропуск
     * водителя. Поэтому выдаём подписанную ссылку на десять минут: в ней
     * номер договора и срок, подпись — секретом сервера. Подделать или
     * продлить её нельзя, а переслать — бесполезно, через десять минут она
     * погаснет.
     */
    async driverLink(userId: string): Promise<{ path: string; expiresAt: Date }> {
        const driver = await this.prisma.exchangeDriver.findUnique({ where: { userId }, select: { id: true, parkCompanyId: true } });
        const contract = driver && await this.latestSigned(driver.id, driver.parkCompanyId);
        if (!contract) throw new NotFoundException('Договор ещё не подписан');
        const expires = Date.now() + LINK_TTL_MS;
        const payload = `${contract.id}.${expires}`;
        return { path: `/exchange/contract-pdf/${payload}.${this.sign(payload)}`, expiresAt: new Date(expires) };
    }

    /** PDF по подписанной ссылке. Неверная или просроченная — «не найдено», без подробностей. */
    async pdfByLink(token: string) {
        const [id, expires, mac] = String(token).split('.');
        const payload = `${id}.${expires}`;
        const expected = this.sign(payload);
        const valid = !!id && !!mac && mac.length === expected.length
            && timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
            && Number(expires) > Date.now();
        if (!valid) throw new NotFoundException('Ссылка устарела — откройте договор в приложении ещё раз');
        const contract = await this.prisma.exchangeDriverContract.findUnique({ where: { id }, select: CONTRACT_SELECT });
        if (!contract) throw new NotFoundException('Ссылка устарела — откройте договор в приложении ещё раз');
        return { number: contract.number, pdf: await this.pdf(contract) };
    }

    private sign(payload: string): string {
        const secret = this.config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET environment variable is not configured');
        return createHmac('sha256', `park-contract:${secret}`).update(payload).digest('base64url');
    }
}
