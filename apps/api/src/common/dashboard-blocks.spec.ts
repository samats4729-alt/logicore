import { readFileSync } from 'fs';
import { resolve } from 'path';
import { UserRole } from '@prisma/client';
import { блокиПоРоли, видимыеБлоки, БЛОКИ_ДАШБОРДА, НАЗВАНИЯ_БЛОКОВ } from './dashboard-blocks';

/**
 * Что человек видит на дашборде.
 *
 * Две вещи здесь стоят проверки. Первая — что в день обновления ни у кого
 * ничего не пропало: пока руководитель набор не задавал, работает прежнее
 * правило по роли. Вторая — что заданный набор сильнее роли, в том числе
 * пустой: «не показывать ничего» это ответ, а не отсутствие ответа.
 */

const WEB_MIRROR = resolve(__dirname, '../../../web/src/lib/dashboard-blocks.ts');

describe('Блоки дашборда', () => {
    describe('пока набор не задан — как было по роли', () => {
        it('администратор компании и экспедитор видят дашборд целиком', () => {
            for (const роль of [UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.ADMIN]) {
                expect(блокиПоРоли(роль)).toEqual([...БЛОКИ_ДАШБОРДА]);
            }
        });

        it('бухгалтеру денежные блоки открыты вместе с правом «Бухгалтерия»', () => {
            expect(блокиПоРоли(UserRole.ACCOUNTANT, ['accounting'])).toContain('paymentCalendar');
        });

        it('бухгалтеру без этого права деньги не показываем', () => {
            // Сервер на эти данные ответит отказом, и блок показал бы пустоту
            // вместо работы.
            expect(блокиПоРоли(UserRole.ACCOUNTANT, [])).toEqual(['events']);
        });

        it('менеджеру — личная сводка и лента событий', () => {
            expect(блокиПоРоли(UserRole.LOGISTICIAN, ['orders'])).toEqual(['events']);
        });
    });

    describe('заданный набор сильнее роли', () => {
        it('менеджеру можно открыть платёжный календарь', () => {
            const блоки = видимыеБлоки({
                role: UserRole.LOGISTICIAN,
                dashboardCustom: true,
                dashboardBlocks: ['paymentCalendar', 'events'],
            });
            expect(блоки).toEqual(['paymentCalendar', 'events']);
        });

        it('администратору можно оставить один блок', () => {
            const блоки = видимыеБлоки({
                role: UserRole.COMPANY_ADMIN,
                dashboardCustom: true,
                dashboardBlocks: ['events'],
            });
            expect(блоки).toEqual(['events']);
        });

        it('пустой набор означает пустой дашборд, а не «тогда по роли»', () => {
            // Иначе закрыть дашборд вовсе было бы нельзя: сняв последнюю
            // галочку, руководитель получил бы обратно полный набор.
            expect(видимыеБлоки({
                role: UserRole.COMPANY_ADMIN,
                dashboardCustom: true,
                dashboardBlocks: [],
            })).toEqual([]);
        });

        it('пока признак не поднят, сохранённые галочки ни на что не влияют', () => {
            expect(видимыеБлоки({
                role: UserRole.COMPANY_ADMIN,
                dashboardCustom: false,
                dashboardBlocks: ['events'],
            })).toEqual([...БЛОКИ_ДАШБОРДА]);
        });

        it('выдуманное название в наборе не превращается в блок', () => {
            expect(видимыеБлоки({
                role: UserRole.LOGISTICIAN,
                dashboardCustom: true,
                dashboardBlocks: ['events', 'зарплата-директора'],
            })).toEqual(['events']);
        });
    });

    describe('браузер знает то же правило', () => {
        // Дашборд рисует браузер по своей копии этого файла. Разъедутся —
        // руководитель выдаст галочку, за которой ничего не появится, либо
        // наоборот: сервер отдаст данные, а блок не покажется.
        const мираж = readFileSync(WEB_MIRROR, 'utf8');

        it('список блоков совпадает', () => {
            for (const блок of БЛОКИ_ДАШБОРДА) {
                expect(мираж).toContain(`'${блок}'`);
            }
        });

        it('подписи совпадают', () => {
            for (const подпись of Object.values(НАЗВАНИЯ_БЛОКОВ)) {
                expect(мираж).toContain(подпись);
            }
        });
    });
});
