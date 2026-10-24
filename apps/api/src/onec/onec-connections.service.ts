import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Что компания решает сама: идёт ли обмен вообще и что в нём передаётся.
 * Из LogiCore в 1С — свои акты, акты перевозчиков, договоры; из 1С в
 * LogiCore — контрагенты, оплаты клиентов, оплаты перевозчикам.
 */
export interface OneCConnectionChoices {
    enabled?: boolean;
    sendActs?: boolean;
    sendCarrierActs?: boolean;
    sendContracts?: boolean;
    receiveCounterparties?: boolean;
    receivePayments?: boolean;
    receiveCarrierPayments?: boolean;
}

const CHOICE_KEYS = [
    'enabled', 'sendActs', 'sendCarrierActs', 'sendContracts', 'receiveCounterparties', 'receivePayments', 'receiveCarrierPayments',
] as const;
const CHOICE_SELECT = Object.fromEntries(CHOICE_KEYS.map((k) => [k, true])) as Record<(typeof CHOICE_KEYS)[number], true>;

/** Без похожих друг на друга букв и цифр: пароль переписывают в 1С руками. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomString = (length: number) => Array.from({ length }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join('');

/**
 * Подключение 1С компании — в кабинете (решение владельца 22–23.10.2026).
 *
 * Компания включает обмен и получает для своей 1С адрес с ключом — его
 * достаточно, логин и пароль в 1С можно не вписывать (облачная 1С их и не
 * присылает). Для 1С, которая просит логин и пароль, они тоже выдаются; ключ
 * в адресе и пароль — одно и то же. Показываются один раз — у нас только
 * хеш. Забыли — выдаём новый, старый перестаёт работать.
 */
@Injectable()
export class OneCConnectionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {}

    /** Адрес для 1С: наш внешний адрес + /1c/<ключ>. */
    addressOf(id: string) {
        const base = (this.config.get<string>('API_PUBLIC_URL') || '').trim().replace(/\/+$/, '')
            || `http://localhost:${this.config.get<string>('PORT') || 3001}`;
        return `${base}/1c/${id}`;
    }

    async list(companyId: string) {
        const rows = await this.prisma.oneCConnection.findMany({
            where: { companyId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true, login: true, peerName: true, peerNodeCode: true, formatVersion: true, ...CHOICE_SELECT,
                exchangePlanName: true, setupAt: true, lastSeenAt: true, createdAt: true,
                log: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, operation: true, ok: true, message: true, createdAt: true } },
            },
        });
        return rows.map(({ peerNodeCode, ...r }) => ({ ...r, address: this.addressOf(r.id), connected: !!peerNodeCode && !!r.setupAt }));
    }

    async create(companyId: string, userId: string) {
        const password = randomString(16);
        const row = await this.prisma.oneCConnection.create({
            data: {
                companyId,
                login: `lc${randomString(8).toLowerCase()}`,
                passwordHash: await bcrypt.hash(password, 10),
                nodeCode: randomUUID(),
                createdById: userId,
            },
            select: { id: true, login: true },
        });
        return this.secret(row.id, row.login, password);
    }

    private async own(companyId: string, id: string) {
        const row = await this.prisma.oneCConnection.findFirst({ where: { id, companyId }, select: { id: true, login: true } });
        if (!row) throw new NotFoundException('Подключение 1С не найдено');
        return row;
    }

    /** Новый пароль: прежний сразу перестаёт работать. */
    async resetPassword(companyId: string, id: string) {
        const row = await this.own(companyId, id);
        const password = randomString(16);
        await this.prisma.oneCConnection.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
        return this.secret(id, row.login, password);
    }

    /** Что показать один раз: адрес с ключом, а также логин и пароль для 1С, которая их просит. */
    private secret(id: string, login: string, password: string) {
        const address = this.addressOf(id);
        return { id, address, keyAddress: `${address}/${password}`, login, password };
    }

    /** Приостановить или возобновить обмен и выбрать, что передавать. */
    async update(companyId: string, id: string, data: OneCConnectionChoices) {
        await this.own(companyId, id);
        const fields = CHOICE_KEYS.filter((k) => typeof data[k] === 'boolean');
        const row = await this.prisma.oneCConnection.update({
            where: { id },
            data: Object.fromEntries(fields.map((k) => [k, data[k]])),
            select: { id: true, ...CHOICE_SELECT },
        });
        return row;
    }
}
