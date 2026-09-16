import { UserRole } from '@prisma/client';
import { documentsOfOwnOrders, managerOrdersFilter, ownOrdersWhere } from './manager-orders';

/**
 * Приватность заявок менеджера — там, где показываются деньги.
 *
 * Раньше правило жило внутри списка заявок и дальше не шло: в «Заявках»
 * менеджер видел свои пять рейсов, а в журнале счетов, во взаиморасчётах и в
 * итогах над ними — деньги всей компании. Прятать рейс, но показывать счёт по
 * нему со ставкой и контрагентом — это не приватность, а её видимость.
 *
 * Проверяется здесь само правило: кого сужаем, чем именно и когда не сужаем
 * вовсе. Промахнись любая из трёх частей — данные утекут тихо, потому что и
 * суженный, и полный список выглядят одинаково правдоподобно.
 */

const КОМПАНИЯ = 'org-1';
const Я = 'user-1';

function prisma(managersSeeOwnOrdersOnly: boolean | null) {
    return {
        company: {
            findUnique: jest.fn(async () => (
                managersSeeOwnOrdersOnly === null ? null : { managersSeeOwnOrdersOnly }
            )),
        },
    };
}

describe('Свои заявки менеджера', () => {
    describe('кого сужаем', () => {
        it('менеджера — сужаем', async () => {
            const итог = await managerOrdersFilter(prisma(true), {
                companyId: КОМПАНИЯ, role: UserRole.LOGISTICIAN, userId: Я,
            });
            expect(итог).not.toBeNull();
        });

        it('бухгалтера, администратора и экспедитора — нет', async () => {
            // Они ведут деньги всей компании: сузь им журнал — и сверка
            // перестанет сходиться с банком.
            for (const роль of [UserRole.ACCOUNTANT, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.ADMIN]) {
                const итог = await managerOrdersFilter(prisma(true), {
                    companyId: КОМПАНИЯ, role: роль, userId: Я,
                });
                expect(итог).toBeNull();
            }
        });

        it('без пользователя не сужаем, но и не выдумываем отбор', async () => {
            // Публичные страницы приходят без человека. Вернуть здесь «отбор
            // по пустому userId» значило бы отдать пустой отчёт вместо ошибки.
            const итог = await managerOrdersFilter(prisma(true), {
                companyId: КОМПАНИЯ, role: UserRole.LOGISTICIAN, userId: null,
            });
            expect(итог).toBeNull();
        });
    });

    describe('настройка компании', () => {
        it('выключена — менеджер видит всё, как и в «Заявках»', async () => {
            const итог = await managerOrdersFilter(prisma(false), {
                companyId: КОМПАНИЯ, role: UserRole.LOGISTICIAN, userId: Я,
            });
            expect(итог).toBeNull();
        });

        it('по умолчанию включена: неизвестная компания сужает, а не открывает', async () => {
            // Промах в другую сторону дороже: открыть лишнее нельзя откатить,
            // а лишнее сужение человек заметит сразу и пожалуется.
            const итог = await managerOrdersFilter(prisma(null), {
                companyId: КОМПАНИЯ, role: UserRole.LOGISTICIAN, userId: Я,
            });
            expect(итог).not.toBeNull();
        });

        it('за настройкой ходим только для менеджера', async () => {
            const db = prisma(true);
            await managerOrdersFilter(db, {
                companyId: КОМПАНИЯ, role: UserRole.ACCOUNTANT, userId: Я,
            });
            expect(db.company.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('чем именно сужаем', () => {
        const условие = ownOrdersWhere(КОМПАНИЯ, Я);

        it('своя — та, где он ответственный', () => {
            expect(условие.OR).toContainEqual({
                responsibles: { some: { companyId: КОМПАНИЯ, userId: Я } },
            });
            expect(условие.OR).toContainEqual({ responsibleManagerId: Я });
        });

        it('своя — и та, которую он завёл', () => {
            expect(условие.OR).toContainEqual({ customerId: Я });
        });

        it('непринятые заявки видны всем менеджерам', () => {
            // «Кто примет, тот и ведёт». Спрячь их — новая заявка не досталась
            // бы никому, и работа встала бы на ровном месте.
            expect(условие.OR).toContainEqual({ responsibles: { none: { companyId: КОМПАНИЯ } } });
        });
    });

    describe('счета к своим заявкам', () => {
        it('документ отбирается по своим рейсам', () => {
            const условие = documentsOfOwnOrders(ownOrdersWhere(КОМПАНИЯ, Я));
            expect(условие.orders).toEqual({ some: { order: ownOrdersWhere(КОМПАНИЯ, Я) } });
        });

        it('счёт без единого рейса менеджеру не показывается', () => {
            // `some` не совпадает ни с чем, когда связей нет. Это решение, а
            // не недосмотр: по такому счёту нельзя понять, свой он или чужой,
            // а журнал менеджера отвечает на вопрос «что по моим рейсам».
            const условие = documentsOfOwnOrders(ownOrdersWhere(КОМПАНИЯ, Я));
            expect(условие.orders).toHaveProperty('some');
            expect(условие.orders).not.toHaveProperty('none');
        });
    });
});
