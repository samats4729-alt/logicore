import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CardPaymentService } from './card-payment.service';
import { buildXmlResponse, parseFlatXml } from './freedompay.xml';

/**
 * Оплата подписки картой.
 *
 * Здесь ходят настоящие деньги, и обе ошибки дорогие: продлить подписку без
 * оплаты — потерять деньги владельца, не продлить после оплаты — потерять
 * компанию, которая уже заплатила. Поэтому проверяется не «вызвался ли
 * метод», а то, что реально произошло с записью платежа и с подпиской.
 *
 * Хранилище платежей здесь настоящее, в памяти: защита от повторного
 * продления построена на условном обновлении (`updateMany` по `appliedAt:
 * null`), и подменённый заглушкой ответ проверял бы заглушку, а не защиту.
 */

const КОМПАНИЯ = 'c-1';
const РЕЗУЛЬТАТ = 'https://api.example.com/billing/freedompay/result';
const ПРОВЕРКА = 'https://api.example.com/billing/freedompay/check';

/** Платежи в памяти — с тем поведением `updateMany`, на котором всё держится. */
function хранилищеПлатежей() {
    const строки = new Map<string, any>();
    let счётчик = 0;

    const подходит = (строка: any, where: any): boolean => {
        for (const [поле, условие] of Object.entries(where ?? {})) {
            const значение = строка[поле];
            if (условие && typeof условие === 'object' && !(условие instanceof Date)) {
                const у = условие as any;
                if ('not' in у && у.not === null && значение === null) return false;
                if ('gt' in у && !(значение > у.gt)) return false;
            } else if (значение !== условие) {
                return false;
            }
        }
        return true;
    };

    return {
        строки,
        api: {
            create: jest.fn(async ({ data }: any) => {
                счётчик += 1;
                const строка = {
                    id: `pay-${счётчик}`,
                    currency: 'KZT',
                    status: 'PENDING',
                    providerPaymentId: null,
                    redirectUrl: null,
                    cardPan: null,
                    failureCode: null,
                    failureDescription: null,
                    paidAt: null,
                    appliedAt: null,
                    createdAt: new Date(),
                    company: { name: 'ТОО «Пример»', bin: '123456789012' },
                    ...data,
                };
                строки.set(строка.id, строка);
                return строка;
            }),
            findUnique: jest.fn(async ({ where }: any) => строки.get(where.id) ?? null),
            findFirst: jest.fn(async ({ where }: any) => {
                for (const строка of строки.values()) {
                    if (подходит(строка, where)) return строка;
                }
                return null;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const строка = строки.get(where.id);
                Object.assign(строка, data);
                return строка;
            }),
            updateMany: jest.fn(async ({ where, data }: any) => {
                let count = 0;
                for (const строка of строки.values()) {
                    if (подходит(строка, where)) {
                        Object.assign(строка, data);
                        count += 1;
                    }
                }
                return { count };
            }),
        },
    };
}

function стенд(options: { enabled?: boolean; amount?: number; готов?: boolean } = {}) {
    const платежи = хранилищеПлатежей();
    const prisma: any = { subscriptionPayment: платежи.api };

    const freedompay: any = {
        готов: () => options.готов ?? true,
        resultUrl: () => РЕЗУЛЬТАТ,
        checkUrl: () => ПРОВЕРКА,
        initPayment: jest.fn(async () => ({
            redirectUrl: 'https://bank.example.com/pay/1',
            providerPaymentId: '777',
        })),
        подписьВерна: jest.fn(() => true),
        // Сборку XML берём настоящую: тест читает ровно то, что уйдёт шлюзу.
        ответ: (_url: string, поля: Record<string, string>) => buildXmlResponse(поля),
    };

    const billing: any = {
        getSettings: jest.fn(async () => ({ enabled: options.enabled ?? true, trialDays: 14, graceDays: 3 })),
        getPurchaseQuote: jest.fn(async (_companyId: string, months: number) => ({
            months,
            users: 3,
            pricePerUser: 5000,
            amount: options.amount ?? 5000 * 3 * months,
            planId: 'plan-1',
            companyName: 'ТОО «Пример»',
            companyBin: '123456789012',
        })),
        updateCompanySubscription: jest.fn(async () => ({ periodEnd: new Date('2026-12-01') })),
    };

    const telegram: any = { send: jest.fn().mockResolvedValue(true) };
    const config: any = { get: (ключ: string) => (ключ === 'FRONTEND_URL' ? 'https://app.example.com' : undefined) };

    return {
        service: new CardPaymentService(prisma, freedompay, billing, telegram, config),
        платежи,
        freedompay,
        billing,
        telegram,
    };
}

/** Ответ шлюза «оплачено» с нужной суммой. */
const оплачено = (id: string, amount = 45000) => ({
    pg_order_id: id,
    pg_payment_id: '777',
    pg_amount: String(amount),
    pg_currency: 'KZT',
    pg_result: '1',
    pg_card_pan: '4444 44** **** 6666',
    pg_salt: 'соль',
    pg_sig: 'подпись',
});

describe('Оплата подписки картой', () => {
    describe('начало оплаты', () => {
        it('заводит платёж на сумму, посчитанную сервером, и отдаёт ссылку банка', async () => {
            const { service, платежи, freedompay } = стенд();

            const результат = await service.start(КОМПАНИЯ, { id: 'u-1', email: 'a@b.kz' }, { months: 3 });

            expect(результат.redirectUrl).toBe('https://bank.example.com/pay/1');
            expect(результат.amount).toBe(45000);

            const платёж = платежи.строки.get(результат.paymentId);
            expect(платёж).toMatchObject({
                companyId: КОМПАНИЯ,
                months: 3,
                amount: 45000,
                users: 3,
                status: 'PENDING',
                providerPaymentId: '777',
            });

            // Номер нашего платежа уходит номером заказа: другого способа
            // опознать потом ответ шлюза нет.
            expect(freedompay.initPayment).toHaveBeenCalledWith(
                expect.objectContaining({ paymentId: результат.paymentId, amount: 45000 }),
            );
        });

        it('сумму из браузера не слушает', async () => {
            const { service, billing } = стенд();

            await service.start(КОМПАНИЯ, {}, { months: 1, amount: 1 } as any);

            expect(billing.getPurchaseQuote).toHaveBeenCalledWith(КОМПАНИЯ, 1);
        });

        it('адреса возврата ведут на страницу этого платежа', async () => {
            const { service, freedompay } = стенд();

            const { paymentId } = await service.start(КОМПАНИЯ, {}, { months: 1 });

            expect(freedompay.initPayment).toHaveBeenCalledWith(expect.objectContaining({
                successUrl: `https://app.example.com/billing/payment/${paymentId}`,
                failureUrl: `https://app.example.com/billing/payment/${paymentId}?failed=1`,
            }));
        });

        it('повторное нажатие возвращает ту же ссылку, а не второй платёж', async () => {
            const { service, платежи, freedompay } = стенд();

            const первый = await service.start(КОМПАНИЯ, {}, { months: 3 });
            const второй = await service.start(КОМПАНИЯ, {}, { months: 3 });

            expect(второй.paymentId).toBe(первый.paymentId);
            expect(платежи.строки.size).toBe(1);
            expect(freedompay.initPayment).toHaveBeenCalledTimes(1);
        });

        it('другой срок — другой платёж', async () => {
            const { service, платежи } = стенд();

            await service.start(КОМПАНИЯ, {}, { months: 3 });
            await service.start(КОМПАНИЯ, {}, { months: 6 });

            expect(платежи.строки.size).toBe(2);
        });

        it('шлюз не ответил — платёж помечен, человеку сказано понятно', async () => {
            const { service, платежи, freedompay } = стенд();
            freedompay.initPayment.mockRejectedValue(new Error('нет сети'));

            await expect(service.start(КОМПАНИЯ, {}, { months: 1 }))
                .rejects.toBeInstanceOf(ServiceUnavailableException);

            // Иначе платёж навсегда остался бы «в ожидании» и попал в отчёт
            // как неоплаченный.
            const [платёж] = [...платежи.строки.values()];
            expect(платёж.status).toBe('FAILED');
            expect(платёж.failureDescription).toContain('нет сети');
        });

        it('пока оплата на платформе выключена, платить нечего', async () => {
            const { service } = стенд({ enabled: false });

            await expect(service.start(КОМПАНИЯ, {}, { months: 1 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('цена не назначена — оплату не начинаем', async () => {
            const { service } = стенд({ amount: 0 });

            await expect(service.start(КОМПАНИЯ, {}, { months: 1 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('без настроенного магазина кнопка не работает', async () => {
            const { service } = стенд({ готов: false });

            expect(service.доступна()).toBe(false);
            await expect(service.start(КОМПАНИЯ, {}, { months: 1 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('ответ платёжной системы', () => {
        const начать = async (стендик: ReturnType<typeof стенд>) =>
            (await стендик.service.start(КОМПАНИЯ, { id: 'u-1' }, { months: 3 })).paymentId;

        it('продлевает подписку на оплаченный срок', async () => {
            const s = стенд();
            const id = await начать(s);

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));

            expect(parseFlatXml(xml).pg_status).toBe('ok');
            expect(s.billing.updateCompanySubscription).toHaveBeenCalledWith(
                КОМПАНИЯ,
                expect.objectContaining({ months: 3, planId: 'plan-1' }),
            );
            expect(s.платежи.строки.get(id)).toMatchObject({
                status: 'SUCCESS',
                cardPan: '4444 44** **** 6666',
            });
            expect(s.платежи.строки.get(id).appliedAt).toBeTruthy();
        });

        it('повторный ответ шлюза месяцев не добавляет', async () => {
            // Шлюз повторяет результат, пока не получит внятное «принято» —
            // без защиты один платёж продлил бы подписку дважды.
            const s = стенд();
            const id = await начать(s);

            await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));
            const второй = await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));

            expect(parseFlatXml(второй).pg_status).toBe('ok');
            expect(s.billing.updateCompanySubscription).toHaveBeenCalledTimes(1);
        });

        it('без верной подписи не продлевает ничего', async () => {
            // Адрес открыт без входа: это единственный замок на нём.
            const s = стенд();
            const id = await начать(s);
            s.freedompay.подписьВерна.mockReturnValue(false);

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));

            expect(parseFlatXml(xml).pg_status).toBe('error');
            expect(s.billing.updateCompanySubscription).not.toHaveBeenCalled();
            expect(s.платежи.строки.get(id).status).toBe('PENDING');
        });

        it('ответ по неизвестному платежу ничего не меняет', async () => {
            const s = стенд();

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, оплачено('чужой-номер'));

            expect(parseFlatXml(xml).pg_status).toBe('error');
            expect(s.billing.updateCompanySubscription).not.toHaveBeenCalled();
        });

        it('отказ банка запоминается с причиной', async () => {
            const s = стенд();
            const id = await начать(s);

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, {
                ...оплачено(id),
                pg_result: '0',
                pg_failure_code: '110',
                pg_failure_description: 'Недостаточно средств',
            });

            expect(parseFlatXml(xml).pg_status).toBe('ok');
            expect(s.платежи.строки.get(id)).toMatchObject({
                status: 'FAILED',
                failureCode: '110',
                failureDescription: 'Недостаточно средств',
            });
            expect(s.billing.updateCompanySubscription).not.toHaveBeenCalled();
        });

        it('отказ по уже оплаченному платежу оплату не отменяет', async () => {
            // Так быть не должно, но если пришло — деньги у нас, и снимать
            // подписку по такому сообщению нельзя.
            const s = стенд();
            const id = await начать(s);
            await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, {
                ...оплачено(id), pg_result: '0', pg_failure_description: 'Возврат',
            });

            expect(parseFlatXml(xml).pg_status).toBe('ok');
            expect(s.платежи.строки.get(id).status).toBe('SUCCESS');
            expect(s.платежи.строки.get(id).appliedAt).toBeTruthy();
        });

        it('списали не ту сумму — деньги приняты, подписка не продлена, владелец предупреждён', async () => {
            const s = стенд();
            const id = await начать(s);

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id, 100));

            expect(parseFlatXml(xml).pg_status).toBe('ok');
            expect(s.billing.updateCompanySubscription).not.toHaveBeenCalled();
            expect(s.платежи.строки.get(id).status).toBe('SUCCESS');
            expect(s.платежи.строки.get(id).appliedAt).toBeNull();
            expect(s.telegram.send.mock.calls.at(-1)?.[0]).toContain('расхожден');
        });

        it('сумма с копейками в ответе считается той же', async () => {
            const s = стенд();
            const id = await начать(s);

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, оплаченоСКопейками(id));

            expect(parseFlatXml(xml).pg_status).toBe('ok');
            expect(s.billing.updateCompanySubscription).toHaveBeenCalledTimes(1);
        });

        it('продление упало — отметка снята, шлюзу сказано прислать ещё раз', async () => {
            const s = стенд();
            const id = await начать(s);
            s.billing.updateCompanySubscription.mockRejectedValue(new Error('база недоступна'));

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));

            expect(parseFlatXml(xml).pg_status).toBe('error');
            // Отметка снята — иначе повторный ответ прошёл бы мимо, и
            // оплаченная подписка так и не продлилась бы.
            expect(s.платежи.строки.get(id).appliedAt).toBeNull();

            s.billing.updateCompanySubscription.mockResolvedValue({ periodEnd: new Date('2026-12-01') });
            const повтор = await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));

            expect(parseFlatXml(повтор).pg_status).toBe('ok');
            expect(s.платежи.строки.get(id).appliedAt).toBeTruthy();
        });

        it('сообщает владельцу об оплате', async () => {
            const s = стенд();
            const id = await начать(s);

            await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));

            const текст: string = s.telegram.send.mock.calls[0][0];
            expect(текст).toContain('ТОО «Пример»');
            // Пробел в «45 000» неразрывный: сравниваем с тем же форматированием,
            // а не с набранным руками числом.
            expect(текст).toContain((45000).toLocaleString('ru-RU'));
        });

        it('не падает, если телеграм молчит', async () => {
            const s = стенд();
            const id = await начать(s);
            s.telegram.send.mockRejectedValue(new Error('нет сети'));

            const xml = await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(id));

            expect(parseFlatXml(xml).pg_status).toBe('ok');
            expect(s.billing.updateCompanySubscription).toHaveBeenCalledTimes(1);
        });
    });

    describe('предварительная проверка заказа', () => {
        it('подтверждает свой неоплаченный заказ', async () => {
            const s = стенд();
            const { paymentId } = await s.service.start(КОМПАНИЯ, {}, { months: 3 });

            const xml = await s.service.handleCheck(ПРОВЕРКА, оплачено(paymentId));

            expect(parseFlatXml(xml).pg_status).toBe('ok');
        });

        it('отклоняет чужой номер заказа', async () => {
            const s = стенд();

            const xml = await s.service.handleCheck(ПРОВЕРКА, оплачено('нет-такого'));

            expect(parseFlatXml(xml).pg_status).toBe('rejected');
        });

        it('отклоняет уже оплаченный заказ', async () => {
            // Деньги тогда не спишутся вовсе — возвращать будет нечего.
            const s = стенд();
            const { paymentId } = await s.service.start(КОМПАНИЯ, {}, { months: 3 });
            await s.service.handleResult(РЕЗУЛЬТАТ, оплачено(paymentId));

            const xml = await s.service.handleCheck(ПРОВЕРКА, оплачено(paymentId));

            expect(parseFlatXml(xml).pg_status).toBe('rejected');
        });

        it('отклоняет чужую сумму', async () => {
            const s = стенд();
            const { paymentId } = await s.service.start(КОМПАНИЯ, {}, { months: 3 });

            const xml = await s.service.handleCheck(ПРОВЕРКА, оплачено(paymentId, 1));

            expect(parseFlatXml(xml).pg_status).toBe('rejected');
        });

        it('без верной подписи не подтверждает', async () => {
            const s = стенд();
            const { paymentId } = await s.service.start(КОМПАНИЯ, {}, { months: 3 });
            s.freedompay.подписьВерна.mockReturnValue(false);

            const xml = await s.service.handleCheck(ПРОВЕРКА, оплачено(paymentId));

            expect(parseFlatXml(xml).pg_status).toBe('error');
        });
    });

    describe('состояние платежа для кабинета', () => {
        it('отдаёт свой платёж', async () => {
            const s = стенд();
            const { paymentId } = await s.service.start(КОМПАНИЯ, {}, { months: 3 });

            const состояние = await s.service.getStatus(КОМПАНИЯ, paymentId);

            expect(состояние).toMatchObject({ id: paymentId, months: 3, amount: 45000 });
        });

        it('чужой платёж не отдаёт', async () => {
            const s = стенд();
            const { paymentId } = await s.service.start(КОМПАНИЯ, {}, { months: 3 });

            await expect(s.service.getStatus('другая-компания', paymentId))
                .rejects.toBeInstanceOf(NotFoundException);
        });
    });
});

/** Шлюз может вернуть сумму с копейками — «45000.00» это те же 45 000 ₸. */
function оплаченоСКопейками(id: string) {
    return { ...оплачено(id), pg_amount: '45000.00' };
}
