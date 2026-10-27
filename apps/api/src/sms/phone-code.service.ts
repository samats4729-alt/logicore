import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../exchange/driver-identity';
import { SmsProvider, smsProviderFrom } from './sms-providers';

export type CodePurpose = 'REGISTER' | 'LOGIN';

/** Код живёт пять минут. */
const TTL_MS = 5 * 60 * 1000;
/** Повторная отправка на тот же номер — не раньше чем через минуту. */
const RESEND_MS = 60 * 1000;
/** Неверных попыток на один код. */
const MAX_ATTEMPTS = 5;
/** Кодов на номер за сутки и с одного адреса за час — каждая СМС стоит денег. */
const PER_PHONE_DAY = 5;
const PER_IP_HOUR = 10;

class TooManyRequests extends HttpException {
    constructor(message: string) {
        super(message, HttpStatus.TOO_MANY_REQUESTS);
    }
}

/**
 * Коды из СМС для регистрации и входа водителя (вопрос 26).
 *
 * Пока сервис СМС не подключён (`SMS_PROVIDER` пуст), коды выключены и всё
 * работает по номеру и паролю, как раньше. Код хранится отпечатком, а не
 * цифрами; живёт пять минут; пять неверных попыток — нужен новый.
 *
 * Каждая СМС платная, поэтому отправка ограничена: раз в минуту на номер,
 * пять в сутки на номер, десять в час с одного адреса, и только на
 * казахстанские мобильные (+7 7xx): иначе чужой скрипт разослал бы за наш
 * счёт тысячи СМС на платные номера.
 */
@Injectable()
export class PhoneCodeService {
    private readonly logger = new Logger(PhoneCodeService.name);
    private readonly provider: SmsProvider | null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {
        this.provider = smsProviderFrom({ get: (k) => this.config.get<string>(k) }, (line) => this.logger.log(line));
    }

    /** Включены ли коды из СМС. */
    enabled(): boolean {
        return !!this.provider;
    }

    /** Номер к виду «+77011234567»; не казахстанский мобильный — отказ. */
    phoneOf(raw: string): string {
        const phone = normalizePhone(raw);
        if (!/^\+77\d{9}$/.test(phone)) throw new BadRequestException('Номер — казахстанский мобильный, например +7 701 123 45 67');
        return phone;
    }

    private hash(phone: string, code: string): string {
        const secret = this.config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET environment variable is not configured');
        return createHmac('sha256', `phone-code:${secret}`).update(`${phone}:${code}`).digest('hex');
    }

    /**
     * Есть ли смысл слать код: регистрироваться на занятый номер незачем,
     * входить по номеру, которого нет у водителей, — тоже. Проверка до
     * отправки: каждая СМС стоит денег.
     */
    private async assertPurpose(phone: string, purpose: CodePurpose) {
        const цифры = phone.slice(-10);
        const users = await this.prisma.user.findMany({
            where: { phone: { in: [`+7${цифры}`, `8${цифры}`, `7${цифры}`] } },
            select: { role: true, isActive: true, companyId: true },
        });
        if (purpose === 'REGISTER' && users.length) {
            throw new BadRequestException(users.some((u) => u.role === 'DRIVER' && u.companyId)
                ? 'Этот номер уже есть у водителя компании. Войдите по номеру — пароль выдаёт диспетчер.'
                : 'Этот номер уже зарегистрирован. Войдите по номеру.');
        }
        if (purpose === 'LOGIN' && !users.some((u) => u.role === 'DRIVER' && u.isActive)) {
            throw new BadRequestException('Водителя с таким номером нет. Работаете сами — нажмите «Регистрация»; водителю компании номер заводит диспетчер.');
        }
    }

    /** Отправить код. Возвращает, через сколько секунд можно попросить снова. */
    async send(rawPhone: string, purpose: CodePurpose, ip: string | null): Promise<{ resendIn: number; expiresIn: number }> {
        if (!this.provider) throw new ServiceUnavailableException('Вход по СМС пока не подключён — войдите по номеру и паролю');
        const phone = this.phoneOf(rawPhone);
        await this.assertPurpose(phone, purpose);
        const now = Date.now();

        const last = await this.prisma.phoneCode.findFirst({
            where: { phone, purpose },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        if (last && now - last.createdAt.getTime() < RESEND_MS) {
            const wait = Math.ceil((RESEND_MS - (now - last.createdAt.getTime())) / 1000);
            throw new TooManyRequests(`Код уже отправлен. Новый можно запросить через ${wait} с`);
        }
        const [perPhone, perIp] = await Promise.all([
            this.prisma.phoneCode.count({ where: { phone, createdAt: { gte: new Date(now - 24 * 3600 * 1000) } } }),
            ip ? this.prisma.phoneCode.count({ where: { ip, createdAt: { gte: new Date(now - 3600 * 1000) } } }) : Promise.resolve(0),
        ]);
        if (perPhone >= PER_PHONE_DAY) throw new TooManyRequests('На этот номер сегодня уже отправлено много кодов. Попробуйте завтра или войдите по паролю');
        if (perIp >= PER_IP_HOUR) throw new TooManyRequests('Слишком много запросов кода. Попробуйте через час');

        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const row = await this.prisma.phoneCode.create({
            data: { phone, purpose, codeHash: this.hash(phone, code), expiresAt: new Date(now + TTL_MS), ip },
            select: { id: true },
        });
        try {
            await this.provider.send(phone, `LogiCore: код ${code}. Никому его не сообщайте.`);
        } catch (e: any) {
            // Не ушло — запись не считается: человек сможет попросить снова сразу.
            await this.prisma.phoneCode.delete({ where: { id: row.id } }).catch(() => undefined);
            this.logger.warn(`СМС не ушла на ${phone}: ${e?.message ?? e}`);
            throw new ServiceUnavailableException('СМС не отправилась. Попробуйте через минуту или войдите по паролю');
        }
        return { resendIn: RESEND_MS / 1000, expiresIn: TTL_MS / 1000 };
    }

    /**
     * Проверить код. Верный — код погашен, второй раз не сработает. Неверный —
     * попытка засчитана; пять неверных — код сгорел.
     */
    async verify(rawPhone: string, purpose: CodePurpose, code: string): Promise<string> {
        const phone = this.phoneOf(rawPhone);
        const digits = String(code ?? '').replace(/\D/g, '');
        const row = await this.prisma.phoneCode.findFirst({
            where: { phone, purpose, usedAt: null },
            orderBy: { createdAt: 'desc' },
        });
        if (!row || row.expiresAt.getTime() < Date.now()) throw new BadRequestException('Код устарел — запросите новый');
        if (row.attempts >= MAX_ATTEMPTS) throw new BadRequestException('Слишком много неверных попыток — запросите новый код');
        const expected = Buffer.from(row.codeHash, 'hex');
        const actual = Buffer.from(this.hash(phone, digits), 'hex');
        if (digits.length !== 6 || !timingSafeEqual(expected, actual)) {
            await this.prisma.phoneCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
            const left = MAX_ATTEMPTS - row.attempts - 1;
            throw new BadRequestException(left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Попытки кончились — запросите новый');
        }
        // Условие внутри обновления: два запроса с одним кодом разом — пройдёт один.
        const { count } = await this.prisma.phoneCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
        if (!count) throw new BadRequestException('Код уже использован — запросите новый');
        return phone;
    }
}
