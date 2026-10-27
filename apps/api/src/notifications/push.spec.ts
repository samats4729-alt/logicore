import { ConfigService } from '@nestjs/config';
import { isExpoPushToken, sendExpoPush } from './expo-push';
import { NotificationsService } from './notifications.service';
import { DriverPushService } from './driver-push.service';

/**
 * Push-уведомления водителям через Expo (решение владельца 25.10.2026,
 * вопрос 26): телефоны, отправка, какие события и какими словами.
 */
const TOKEN = (n: number) => `ExponentPushToken[aaaaaaaaaaaa${n}]`;

function fakeFetch(answer: (body: any[]) => any, status = 200) {
    const calls: any[][] = [];
    const fn = jest.fn(async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        calls.push(body);
        return { ok: status < 400, status, json: async () => answer(body) } as any;
    });
    return { fn: fn as unknown as typeof fetch, calls };
}

describe('Expo: отправка', () => {
    it('адрес телефона узнаём по виду', () => {
        expect(isExpoPushToken('ExponentPushToken[abcdefghijkl]')).toBe(true);
        expect(isExpoPushToken('ExpoPushToken[abcdefghijkl]')).toBe(true);
        expect(isExpoPushToken('abc')).toBe(false);
        expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
        expect(isExpoPushToken(null)).toBe(false);
    });

    it('больше ста сообщений — несколькими запросами; звук и канал «default»', async () => {
        const { fn, calls } = fakeFetch((body) => ({ data: body.map(() => ({ status: 'ok', id: 'x' })) }));
        const messages = Array.from({ length: 150 }, (_, i) => ({ to: TOKEN(i), title: 'T', body: 'B' }));
        const tickets = await sendExpoPush(messages, { fetchImpl: fn });
        expect(calls.map((c) => c.length)).toEqual([100, 50]);
        expect(calls[0][0]).toMatchObject({ to: TOKEN(0), sound: 'default', channelId: 'default', priority: 'high' });
        expect(tickets).toHaveLength(150);
    });

    it('Expo недоступен — не исключение, а ответ-ошибка на каждое сообщение', async () => {
        const fn = jest.fn(async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
        const tickets = await sendExpoPush([{ to: TOKEN(1), title: 'T', body: 'B' }], { fetchImpl: fn });
        expect(tickets).toEqual([{ status: 'error', message: 'ECONNRESET' }]);
    });
});

function service(devices: { userId: string; token: string }[], env: Record<string, string> = {}) {
    const store = [...devices];
    const prisma: any = {
        user: { findUnique: jest.fn(async () => ({ role: 'DRIVER' })) },
        pushDevice: {
            findMany: jest.fn(async ({ where }: any) => store.filter((d) => where.userId.in.includes(d.userId))),
            deleteMany: jest.fn(async ({ where }: any) => {
                const before = store.length;
                for (let i = store.length - 1; i >= 0; i--) {
                    const d = store[i];
                    const byToken = where.token?.in ? where.token.in.includes(d.token) : where.token?.not ? d.token !== where.token.not : where.token ? d.token === where.token : true;
                    const byUser = where.userId ? d.userId === where.userId : true;
                    if (byToken && byUser) store.splice(i, 1);
                }
                return { count: before - store.length };
            }),
            upsert: jest.fn(async ({ where, create, update }: any) => {
                const row = store.find((d) => d.token === where.token);
                if (row) Object.assign(row, update); else store.push(create);
            }),
        },
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    return { svc: new NotificationsService(prisma, config), store };
}

describe('Телефоны и отправка', () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });

    it('водитель вошёл с нового телефона — прежний забыт, уведомления идут только на новый', async () => {
        const { svc, store } = service([{ userId: 'u1', token: TOKEN(1) }]);
        await svc.registerDevice('u1', TOKEN(2), 'android', 'dev-2');
        expect(store.map((d) => d.token)).toEqual([TOKEN(2)]);
    });

    it('мусор вместо адреса — отказ', async () => {
        const { svc } = service([]);
        await expect(svc.registerDevice('u1', 'hello', 'android')).rejects.toThrow('Неверный адрес');
    });

    it('шлёт на телефоны людей; удалённое приложение — телефон забываем', async () => {
        const { fn, calls } = fakeFetch((body) => ({
            data: body.map((m: any) => (m.to === TOKEN(2) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'r' })),
        }));
        global.fetch = fn;
        const { svc, store } = service([{ userId: 'u1', token: TOKEN(1) }, { userId: 'u2', token: TOKEN(2) }, { userId: 'u3', token: TOKEN(3) }]);
        const sent = await svc.sendToUsers(['u1', 'u2'], { title: 'Вас выбрали на рейс', body: 'Алматы → Астана' });
        expect(calls[0].map((m: any) => m.to)).toEqual([TOKEN(1), TOKEN(2)]);
        expect(sent).toBe(1);
        expect(store.map((d) => d.token)).toEqual([TOKEN(1), TOKEN(3)]);
    });

    it('нет телефона — никуда не ходим; PUSH_DISABLED — только журнал', async () => {
        const { fn, calls } = fakeFetch(() => ({ data: [] }));
        global.fetch = fn;
        expect(await service([]).svc.sendToUsers(['u1'], { title: 'T', body: 'B' })).toBe(0);
        expect(await service([{ userId: 'u1', token: TOKEN(1) }], { PUSH_DISABLED: 'true' }).svc.sendToUsers(['u1'], { title: 'T', body: 'B' })).toBe(0);
        expect(calls).toHaveLength(0);
    });

    it('сбой базы — не исключение: уведомление не отменяет действие', async () => {
        const { svc } = service([]);
        (svc as any).prisma.pushDevice.findMany = jest.fn(async () => { throw new Error('db down'); });
        await expect(svc.sendToUsers(['u1'], { title: 'T', body: 'B' })).resolves.toBe(0);
    });
});

describe('События водителю', () => {
    const route = [
        { pointType: 'PICKUP', location: { city: 'Алматы', cityRecord: null } },
        { pointType: 'DELIVERY', location: { city: 'Астана', cityRecord: { name: 'Астана' } } },
    ];
    function events(extra: Record<string, any> = {}) {
        const sent: { ids: string[]; content: any }[] = [];
        const notifications: any = { sendToUsers: jest.fn(async (ids: string[], content: any) => { sent.push({ ids, content }); return ids.length; }) };
        const prisma: any = {
            orderRoutePoint: { findMany: jest.fn(async () => route) },
            ...extra,
        };
        return { push: new DriverPushService(prisma, notifications), sent };
    }

    it('выбрали на рейс: выбранному — «вас выбрали», остальным — «груз ушёл»; цены в тексте нет', async () => {
        const { push, sent } = events();
        await push.offerDecided('o1', [{ offerId: 'a', userId: 'u1' }, { offerId: 'b', userId: 'u2' }, { offerId: 'c', userId: 'u3' }], 'b');
        expect(sent[0]).toMatchObject({ ids: ['u2'], content: { title: 'Вас выбрали на рейс', data: { url: '/exchange/(tabs)/trip' } } });
        expect(sent[0].content.body).toContain('Алматы → Астана');
        expect(sent[1]).toMatchObject({ ids: ['u1', 'u3'], content: { title: 'Груз ушёл другому исполнителю' } });
        expect(JSON.stringify(sent)).not.toMatch(/₸/);
    });

    it('выбрали компанию-перевозчика — водителям, что ждали, «груз ушёл»', async () => {
        const { push, sent } = events();
        await push.offerDecided('o1', [{ offerId: 'a', userId: 'u1' }], 'company-offer');
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ ids: ['u1'], content: { title: 'Груз ушёл другому исполнителю' } });
    });

    it('анкета: одобрена — к грузам; отказ — с причиной', async () => {
        const { push, sent } = events({ exchangeDriver: { findUnique: jest.fn(async () => ({ userId: 'u1', park: { name: 'ТОО «Парк»' } })) } });
        await push.driverReviewed('d1', true);
        await push.driverReviewed('d1', false, 'нечитаемое фото прав');
        expect(sent[0].content).toMatchObject({ title: 'Анкета одобрена', body: 'ТОО «Парк»: вы допущены к грузам на бирже.' });
        expect(sent[1].content.body).toBe('Причина: нечитаемое фото прав. Исправьте анкету и отправьте снова.');
    });

    it('выплата: проведена — своя сумма; отклонена — причина', async () => {
        const { push, sent } = events({ driverPayout: { findUnique: jest.fn(async () => ({ toPay: 120000, net: 150000, driver: { userId: 'u1' } })) } });
        await push.payoutDecided('p1', true);
        await push.payoutDecided('p1', false, 'неверный IBAN');
        expect(sent[0].content).toMatchObject({ title: 'Выплата проведена', body: `${(120000).toLocaleString('ru-RU')} ₸ отправлены на ваш счёт.` });
        expect(sent[1].content.body).toContain('Причина: неверный IBAN');
    });

    it('назначили водителя компании: новый — уведомление, тот же — тишина', async () => {
        const order = { driverId: 'u9', orderNumber: 'З-101' };
        const { push, sent } = events({ order: { findUnique: jest.fn(async () => order) } });
        await push.tripAssigned('o1', null);
        await push.tripAssigned('o1', 'u9');
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ ids: ['u9'], content: { title: 'Новый рейс', body: 'Заявка З-101: Алматы → Астана.' } });
    });

    it('сбой при сборке текста — не исключение', async () => {
        const { push } = events({ driverPayout: { findUnique: jest.fn(async () => { throw new Error('db'); }) } });
        await expect(push.payoutDecided('p1', true)).resolves.toBeUndefined();
    });
});
