import { CompanyVerificationStatus } from '@prisma/client';
import { TelegramAdminService } from './telegram-admin.service';

/**
 * Бот подтверждает компании — то есть открывает чужой организации доступ к
 * платформе одним нажатием. Поэтому проверяется здесь прежде всего то, кому
 * он вообще отвечает и под чьим именем записывает решение.
 *
 * Вторая половина проверок — про отказ: причина уходит живому человеку в
 * компанию, и пустая или потерянная причина означает, что организация не
 * знает, что ей исправлять.
 */

const АДМИН = '111';
const ЧУЖОЙ = '999';

/** Что бот сказал и куда — в порядке отправки. */
interface Отправленное { chatId: string; text: string; keyboard?: unknown }

function стенд(опции: { компании?: any[]; ревизор?: any } = {}) {
    const отправлено: Отправленное[] = [];
    const файлы: Array<{ chatId: string; name: string; caption?: string }> = [];

    const telegram = {
        hasToken: () => true,
        sendTo: jest.fn(async (chatId: string, text: string, keyboard?: unknown) => {
            отправлено.push({ chatId: String(chatId), text, keyboard });
            return true;
        }),
        sendDocument: jest.fn(async (chatId: string, file: any, caption?: string) => {
            файлы.push({ chatId: String(chatId), name: file.name, caption });
            return true;
        }),
        answerCallback: jest.fn(async () => undefined),
    };

    const verification = {
        listForReview: jest.fn(async () => опции.компании ?? []),
        readDocument: jest.fn(async () => ({
            stream: (async function* () { yield Buffer.from('устав'); })(),
            mimeType: 'application/pdf',
            fileName: 'ustav.pdf',
        })),
        approve: jest.fn(async (id: string) => ({ id, name: 'ТОО «Барс»' })),
        reject: jest.fn(async (id: string) => ({ id, name: 'ТОО «Барс»' })),
    };

    const хранилище = new Map<string, string>();
    const redis = {
        get: jest.fn(async (key: string) => хранилище.get(key) ?? null),
        set: jest.fn(async (key: string, value: string) => { хранилище.set(key, value); }),
        del: jest.fn(async (key: string) => { хранилище.delete(key); }),
    };

    const prisma = {
        user: {
            findFirst: jest.fn(async () => опции.ревизор ?? null),
        },
    };

    const stats = {
        getOverview: jest.fn(async () => ({
            companies: { total: 12, new30: 3 },
            users: { office: 40, drivers: 18 },
            orders: { total: 900, month: 120, active: 30, completed: 850, problem: 2 },
            gmvMonth: 48_500_000,
            openTickets: 1,
        })),
    };

    const service = new TelegramAdminService(
        prisma as any, redis as any, telegram as any, verification as any, stats as any,
    );

    return { service, telegram, verification, redis, prisma, stats, отправлено, файлы };
}

const сообщение = (chatId: string, text: string) => ({ message: { chat: { id: chatId }, text } });
const нажатие = (chatId: string, data: string) =>
    ({ callback_query: { id: 'нж1', message: { chat: { id: chatId } }, data } });

const КОМПАНИЯ = {
    id: 'к-1',
    name: 'ТОО «Барс»',
    bin: '123456789012',
    directorName: 'Сериков С.',
    email: 'info@bars.kz',
    verificationSubmittedAt: new Date('2026-08-20T10:00:00Z'),
    documents: [{ id: 'д-1', type: 'CHARTER', fileName: 'ustav.pdf' }],
};

describe('Телеграм-бот владельца', () => {
    const окружение = { ...process.env };

    beforeEach(() => {
        process.env.TELEGRAM_ADMIN_IDS = АДМИН;
        process.env.TELEGRAM_ADMIN_EMAIL = 'owner@logicore.kz';
    });

    afterEach(() => {
        process.env = { ...окружение };
    });

    describe('кому бот отвечает', () => {
        it('чужому не показывает ни компаний, ни сводки', async () => {
            const { service, verification, stats, отправлено } = стенд({ компании: [КОМПАНИЯ] });

            await service.handleUpdate(сообщение(ЧУЖОЙ, '/pending'));
            await service.handleUpdate(сообщение(ЧУЖОЙ, '/stats'));

            expect(verification.listForReview).not.toHaveBeenCalled();
            expect(stats.getOverview).not.toHaveBeenCalled();
            expect(отправлено.every((m) => m.text === 'Доступ закрыт.')).toBe(true);
        });

        it('чужой не может подтвердить компанию нажатием кнопки', async () => {
            // Кнопки живут в переписке и пересылаются вместе с сообщением.
            // Проверка доступа обязана быть на нажатии, а не только на команде.
            const { service, verification } = стенд({ компании: [КОМПАНИЯ], ревизор: { id: 'п-1' } });

            await service.handleUpdate(нажатие(ЧУЖОЙ, 'approve:к-1'));

            expect(verification.approve).not.toHaveBeenCalled();
        });

        it('пока список пуст — называет собеседнику его номер и больше ничего', async () => {
            // Иначе свой id взять неоткуда: Telegram его не показывает.
            delete process.env.TELEGRAM_ADMIN_IDS;
            const { service, verification, отправлено } = стенд({ компании: [КОМПАНИЯ] });

            await service.handleUpdate(сообщение(ЧУЖОЙ, '/pending'));

            expect(отправлено[0].text).toContain(ЧУЖОЙ);
            expect(отправлено[0].text).toContain('TELEGRAM_ADMIN_IDS');
            expect(verification.listForReview).not.toHaveBeenCalled();
        });
    });

    describe('очередь проверки', () => {
        it('карточка несёт реквизиты и кнопки решения', async () => {
            const { service, отправлено } = стенд({ компании: [КОМПАНИЯ] });

            await service.handleUpdate(сообщение(АДМИН, '/pending'));

            const карточка = отправлено[0];
            expect(карточка.text).toContain('ТОО «Барс»');
            expect(карточка.text).toContain('123456789012');
            // 10:00 UTC — это 15:00 в Казахстане. Серверное время сбивало бы
            // с толку: «подана вчера» и «подана час назад» требуют разной
            // спешки, а ночью сдвиг переносит подачу во вчерашний день.
            expect(карточка.text).toContain('Подана: 20.08.2026 15:00');
            const кнопки = JSON.stringify(карточка.keyboard);
            expect(кнопки).toContain('approve:к-1');
            expect(кнопки).toContain('reject:к-1');
            expect(кнопки).toContain('docs:к-1');
        });

        it('пустая очередь так и говорит, а не молчит', async () => {
            const { service, отправлено } = стенд({ компании: [] });

            await service.handleUpdate(сообщение(АДМИН, '/pending'));

            expect(отправлено).toHaveLength(1);
            expect(отправлено[0].text).toContain('пуста');
        });

        it('документы уходят файлами с подписью, чьи они', async () => {
            const { service, файлы } = стенд({ компании: [КОМПАНИЯ] });

            await service.handleUpdate(нажатие(АДМИН, 'docs:к-1'));

            expect(файлы).toHaveLength(1);
            expect(файлы[0].name).toBe('ustav.pdf');
            expect(файлы[0].caption).toContain('ТОО «Барс»');
        });

        it('кнопка на вчерашнем сообщении честно говорит, что решение принято', async () => {
            // Кнопки живут в переписке вечно, а очередь меняется. «Документов
            // нет» и «компании в очереди нет» — разные вещи, и дальше человек
            // делает разное.
            const { service, отправлено } = стенд({ компании: [] });

            await service.handleUpdate(нажатие(АДМИН, 'docs:к-1'));

            expect(отправлено[0].text).toContain('в очереди уже нет');
        });
    });

    describe('подтверждение', () => {
        it('записывается на живого администратора платформы', async () => {
            const { service, verification } = стенд({
                компании: [КОМПАНИЯ],
                ревизор: { id: 'п-7', firstName: 'Евгений', lastName: 'Зарутский' },
            });

            await service.handleUpdate(нажатие(АДМИН, 'approve:к-1'));

            expect(verification.approve).toHaveBeenCalledWith('к-1', 'п-7');
        });

        it('не проходит, пока не сказано, под кем записывать', async () => {
            // В истории компании должно стоять имя человека, а не «бот».
            delete process.env.TELEGRAM_ADMIN_EMAIL;
            const { service, verification, отправлено } = стенд({ компании: [КОМПАНИЯ] });

            await service.handleUpdate(нажатие(АДМИН, 'approve:к-1'));

            expect(verification.approve).not.toHaveBeenCalled();
            expect(отправлено[0].text).toContain('TELEGRAM_ADMIN_EMAIL');
        });

        it('ищет администратора платформы, а не любого пользователя с этой почтой', async () => {
            const { service, prisma } = стенд({ ревизор: { id: 'п-7' } });

            await service.handleUpdate(нажатие(АДМИН, 'approve:к-1'));

            expect(prisma.user.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ role: 'ADMIN' }) }),
            );
        });
    });

    describe('отказ', () => {
        it('сперва спрашивает причину, потом отправляет её вместе с отказом', async () => {
            const { service, verification, отправлено } = стенд({ ревизор: { id: 'п-7' } });

            await service.handleUpdate(нажатие(АДМИН, 'reject:к-1'));
            expect(verification.reject).not.toHaveBeenCalled();
            expect(отправлено[0].text).toContain('причину');

            await service.handleUpdate(сообщение(АДМИН, 'Устав без последней страницы'));

            expect(verification.reject).toHaveBeenCalledWith('к-1', 'п-7', 'Устав без последней страницы');
        });

        it('пустую причину не отправляет — компании нечего было бы исправлять', async () => {
            const { service, verification, отправлено } = стенд({ ревизор: { id: 'п-7' } });

            await service.handleUpdate(нажатие(АДМИН, 'reject:к-1'));
            await service.handleUpdate(сообщение(АДМИН, '   '));

            expect(verification.reject).not.toHaveBeenCalled();
            expect(отправлено[отправлено.length - 1].text).toContain('не отправлен');
        });

        it('команда вместо причины остаётся командой', async () => {
            // Иначе «/stats», набранное по забывчивости, уехало бы компании
            // как объяснение, почему её не пустили на платформу.
            const { service, verification, stats } = стенд({ ревизор: { id: 'п-7' } });

            await service.handleUpdate(нажатие(АДМИН, 'reject:к-1'));
            await service.handleUpdate(сообщение(АДМИН, '/stats'));

            expect(verification.reject).not.toHaveBeenCalled();
            expect(stats.getOverview).toHaveBeenCalled();
        });

        it('ожидание причины не липнет к следующему разговору', async () => {
            const { service, verification } = стенд({ ревизор: { id: 'п-7' } });

            await service.handleUpdate(нажатие(АДМИН, 'reject:к-1'));
            await service.handleUpdate(сообщение(АДМИН, 'Нет приказа о директоре'));
            await service.handleUpdate(сообщение(АДМИН, 'спасибо'));

            expect(verification.reject).toHaveBeenCalledTimes(1);
        });
    });

    describe('сводка', () => {
        it('показывает счётчики и оборот', async () => {
            const { service, отправлено } = стенд();

            await service.handleUpdate(сообщение(АДМИН, '/stats'));

            const текст = отправлено[0].text;
            expect(текст).toContain('Компаний: 12');
            expect(текст).toContain('+3');
            expect(текст).toContain('₸');
        });
    });

    describe('извещение о поданной компании', () => {
        it('приходит владельцу сразу, с теми же кнопками', async () => {
            const { service, отправлено } = стенд({ компании: [КОМПАНИЯ] });

            await service.notifySubmitted('к-1');

            expect(отправлено).toHaveLength(2);
            expect(JSON.stringify(отправлено[1].keyboard)).toContain('approve:к-1');
        });

        it('молчит, если бот никому не открыт', async () => {
            delete process.env.TELEGRAM_ADMIN_IDS;
            const { service, отправлено } = стенд({ компании: [КОМПАНИЯ] });

            await service.notifySubmitted('к-1');

            expect(отправлено).toHaveLength(0);
        });
    });

    describe('устойчивость', () => {
        it('непонятное обновление не роняет обработку', async () => {
            // Telegram повторяет обновление, на которое не ответили, — одна
            // ошибка разбора превратилась бы в бесконечный поток повторов.
            const { service } = стенд();

            await expect(service.handleUpdate({ edited_message: {} })).resolves.toBeUndefined();
            await expect(service.handleUpdate(null)).resolves.toBeUndefined();
        });

        it('упавшая проверка компании отвечает текстом, а не тишиной', async () => {
            const { service, verification, отправлено } = стенд({ ревизор: { id: 'п-7' } });
            verification.approve.mockRejectedValueOnce(new Error('Компания уже подтверждена'));

            await service.handleUpdate(нажатие(АДМИН, 'approve:к-1'));

            expect(отправлено[0].text).toContain('Компания уже подтверждена');
        });

        it('очередь показывается порциями, а не сотней сообщений подряд', async () => {
            const много = Array.from({ length: 14 }, (_, i) => ({ ...КОМПАНИЯ, id: `к-${i}` }));
            const { service, отправлено } = стенд({ компании: много });

            await service.handleUpdate(сообщение(АДМИН, '/pending'));

            expect(отправлено).toHaveLength(11);
            expect(отправлено[10].text).toContain('ещё 4');
        });
    });

    it('очередь берётся только из ожидающих проверки', async () => {
        const { service, verification } = стенд({ компании: [КОМПАНИЯ] });

        await service.handleUpdate(сообщение(АДМИН, '/pending'));

        expect(verification.listForReview).toHaveBeenCalledWith(CompanyVerificationStatus.PENDING);
    });
});
