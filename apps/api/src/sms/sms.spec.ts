import { ConfigService } from '@nestjs/config';
import { MobizonSmsProvider, smsProviderFrom } from './sms-providers';
import { PhoneCodeService } from './phone-code.service';

/**
 * Коды из СМС для регистрации и входа водителя (решение владельца
 * 25.10.2026, вопрос 26). Каждая СМС платная — отсюда ограничения.
 */
const PHONE = '+77011234567';

function build(env: Record<string, string> = { SMS_PROVIDER: 'log', JWT_SECRET: 's'.repeat(64) }, users: any[] = []) {
    const rows: any[] = [];
    const sent: string[] = [];
    let now = Date.now();
    const prisma: any = {
        user: { findMany: jest.fn(async () => users) },
        phoneCode: {
            // Копия, как у настоящей базы: правка записи не меняет уже прочитанное.
            findFirst: jest.fn(async ({ where }: any) => { const r = [...rows].reverse().find((x) => x.phone === where.phone && x.purpose === where.purpose && (where.usedAt === undefined || x.usedAt === where.usedAt)); return r ? { ...r } : null; }),
            count: jest.fn(async ({ where }: any) => rows.filter((r) => (where.phone ? r.phone === where.phone : r.ip === where.ip) && r.createdAt >= where.createdAt.gte).length),
            create: jest.fn(async ({ data }: any) => { const r = { id: `c${rows.length + 1}`, attempts: 0, usedAt: null, createdAt: new Date(now), ...data }; rows.push(r); return r; }),
            delete: jest.fn(async ({ where }: any) => { rows.splice(rows.findIndex((r) => r.id === where.id), 1); }),
            update: jest.fn(async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id); r.attempts += data.attempts.increment; return r; }),
            updateMany: jest.fn(async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id && x.usedAt === null); if (!r) return { count: 0 }; Object.assign(r, data); return { count: 1 }; }),
        },
    };
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    const svc = new PhoneCodeService(prisma, config);
    (svc as any).provider = (svc as any).provider && { name: 'test', send: async (_p: string, text: string) => { sent.push(text); } };
    const realNow = Date.now;
    Date.now = () => now;
    return {
        svc, rows, sent,
        later: (ms: number) => { now += ms; },
        restore: () => { Date.now = realNow; },
        codeFrom: () => sent[sent.length - 1].match(/\d{6}/)![0],
    };
}

describe('СМС: выключены, пока сервис не подключён', () => {
    it('без SMS_PROVIDER — кодов нет, регистрация и вход как раньше', async () => {
        const t = build({ JWT_SECRET: 'x' });
        expect(t.svc.enabled()).toBe(false);
        await expect(t.svc.send(PHONE, 'REGISTER', '1.1.1.1')).rejects.toThrow(/пока не подключён/);
        t.restore();
    });

    it('код в журнал — только на стенде, не на рабочем сервере', () => {
        const env = (e: Record<string, string>) => ({ get: (k: string) => e[k] });
        expect(smsProviderFrom(env({ SMS_PROVIDER: 'log' }), () => {})?.name).toBe('log');
        expect(() => smsProviderFrom(env({ SMS_PROVIDER: 'log', NODE_ENV: 'production' }), () => {})).toThrow(/нельзя на рабочем/);
        expect(() => smsProviderFrom(env({ SMS_PROVIDER: 'mobizon' }), () => {})).toThrow(/MOBIZON_API_KEY/);
    });
});

describe('СМС: код', () => {
    it('регистрация: код приходит, подходит один раз', async () => {
        const t = build();
        await expect(t.svc.send('8 701 123 45 67', 'REGISTER', '1.1.1.1')).resolves.toEqual({ resendIn: 60, expiresIn: 300 });
        expect(t.sent[0]).toMatch(/^LogiCore: код \d{6}\. Никому его не сообщайте\.$/);
        // Хранится не код, а отпечаток.
        expect(t.rows[0].codeHash).not.toContain(t.codeFrom());
        await expect(t.svc.verify(PHONE, 'REGISTER', t.codeFrom())).resolves.toBe(PHONE);
        await expect(t.svc.verify(PHONE, 'REGISTER', t.codeFrom())).rejects.toThrow(/устарел/);
        t.restore();
    });

    it('неверный код — попытки считаются, после пяти код сгорает', async () => {
        const t = build();
        await t.svc.send(PHONE, 'REGISTER', null);
        const wrong = t.codeFrom() === '000000' ? '111111' : '000000';
        await expect(t.svc.verify(PHONE, 'REGISTER', wrong)).rejects.toThrow('Неверный код. Осталось попыток: 4');
        for (let i = 0; i < 4; i++) await t.svc.verify(PHONE, 'REGISTER', wrong).catch(() => undefined);
        await expect(t.svc.verify(PHONE, 'REGISTER', t.codeFrom())).rejects.toThrow(/Слишком много неверных/);
        t.restore();
    });

    it('через пять минут код не действует; код входа не подходит к регистрации', async () => {
        const t = build(undefined, [{ role: 'DRIVER', isActive: true, companyId: null }]);
        await t.svc.send(PHONE, 'LOGIN', null);
        await expect(t.svc.verify(PHONE, 'REGISTER', t.codeFrom())).rejects.toThrow(/устарел/);
        t.later(5 * 60 * 1000 + 1);
        await expect(t.svc.verify(PHONE, 'LOGIN', t.codeFrom())).rejects.toThrow(/устарел/);
        t.restore();
    });
});

describe('СМС: ограничения — каждая СМС стоит денег', () => {
    it('повтор не раньше минуты; пять в сутки на номер', async () => {
        const t = build();
        await t.svc.send(PHONE, 'REGISTER', null);
        await expect(t.svc.send(PHONE, 'REGISTER', null)).rejects.toThrow(/через \d+ с/);
        for (let i = 0; i < 4; i++) { t.later(61_000); await t.svc.send(PHONE, 'REGISTER', null); }
        t.later(61_000);
        await expect(t.svc.send(PHONE, 'REGISTER', null)).rejects.toThrow(/сегодня уже отправлено много/);
        t.restore();
    });

    it('десять в час с одного адреса — даже на разные номера', async () => {
        const t = build();
        for (let i = 0; i < 10; i++) await t.svc.send(`+7701000000${i}`, 'REGISTER', '9.9.9.9');
        await expect(t.svc.send('+77019999999', 'REGISTER', '9.9.9.9')).rejects.toThrow(/через час/);
        t.restore();
    });

    it('только казахстанские мобильные', async () => {
        const t = build();
        await expect(t.svc.send('+7 495 123 45 67', 'REGISTER', null)).rejects.toThrow(/казахстанский мобильный/);
        await expect(t.svc.send('+1 202 555 0100', 'REGISTER', null)).rejects.toThrow(/казахстанский мобильный/);
        expect(t.sent).toHaveLength(0);
        t.restore();
    });

    it('занятый номер не регистрируют, несуществующий не входит — и СМС не тратится', async () => {
        const taken = build(undefined, [{ role: 'DRIVER', isActive: true, companyId: 'co' }]);
        await expect(taken.svc.send(PHONE, 'REGISTER', null)).rejects.toThrow(/водителя компании/);
        taken.restore();
        const none = build(undefined, []);
        await expect(none.svc.send(PHONE, 'LOGIN', null)).rejects.toThrow(/Водителя с таким номером нет/);
        expect([...taken.sent, ...none.sent]).toHaveLength(0);
        none.restore();
    });

    it('СМС не ушла — запись не считается, можно попросить снова сразу', async () => {
        const t = build();
        (t.svc as any).provider = { name: 'broken', send: async () => { throw new Error('balance'); } };
        await expect(t.svc.send(PHONE, 'REGISTER', null)).rejects.toThrow(/не отправилась/);
        expect(t.rows).toHaveLength(0);
        t.restore();
    });
});

describe('Mobizon: запрос', () => {
    it('адрес, ключ, номер только цифрами, текст; code 0 — принято', async () => {
        const calls: any[] = [];
        const fetchImpl = jest.fn(async (url: any, init: any) => {
            calls.push({ url, body: new URLSearchParams(init.body) });
            return { ok: true, status: 200, json: async () => ({ code: 0, data: { messageId: 1 } }) } as any;
        }) as unknown as typeof fetch;
        await new MobizonSmsProvider('KEY 1', { fetchImpl, from: 'LogiCore' }).send('+77011234567', 'код 123456');
        expect(calls[0].url).toBe('https://api.mobizon.kz/service/Message/SendSmsMessage?output=json&api=v1&apiKey=KEY%201');
        expect(calls[0].body.get('recipient')).toBe('77011234567');
        expect(calls[0].body.get('text')).toBe('код 123456');
        expect(calls[0].body.get('from')).toBe('LogiCore');
    });

    it('ошибка сервиса — исключение с его текстом', async () => {
        const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ code: 1, message: 'Недостаточно средств' }) })) as unknown as typeof fetch;
        await expect(new MobizonSmsProvider('K', { fetchImpl }).send('+77011234567', 't')).rejects.toThrow('Mobizon: Недостаточно средств');
    });
});
