#!/usr/bin/env node
/**
 * Разовая чистка: убрать тестовые заявки и всё, что они за собой тянут.
 *
 * Решение владельца от 03.09.2026: платформа выходит на боевую работу, а в
 * базе лежат заявки, которыми её проверяли. Компании, сотрудники и
 * контрагенты остаются как есть — они настоящие, их заводили под работу.
 * Убирается только то, что «наработано»: заявки, деньги по ним, документы,
 * договоры и журнал действий.
 *
 * Скрипт разовый и после чистки удаляется из репозитория. Здесь он не для
 * истории, а чтобы владелец мог прочитать список удаляемого до запуска, а
 * не после.
 *
 * ЗАПУСК:
 *
 *   node scripts/clear-orders.js
 *       Только считает. Ничего не удаляет. Показывает таблицу: сколько
 *       чего уйдёт. С этого начинать всегда.
 *
 *   node scripts/clear-orders.js --confirm
 *       Удаляет. Одной транзакцией: либо всё, либо ничего — оборванная
 *       посередине чистка оставила бы счета без заявок.
 *
 *   --with-standalone-finance
 *       Дополнительно убирает расходы и доходы, НЕ привязанные ни к одной
 *       заявке (аренда офиса, прочие траты, заведённые руками). По
 *       умолчанию они остаются: заявками они не порождены, и их
 *       тестовость решает владелец, а не скрипт.
 *
 * ПЕРЕД БОЕВЫМ ЗАПУСКОМ НУЖЕН БЭКАП БАЗЫ. Возврата у этой операции нет.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const УДАЛЯТЬ = process.argv.includes('--confirm');
const С_ПРОЧИМИ_ДЕНЬГАМИ = process.argv.includes('--with-standalone-finance');

/** Расход/доход, не привязанный ни к какой заявке. */
const БЕЗ_ЗАЯВКИ = { orderId: null };
/** Всё, что привязано к заявке. */
const ПО_ЗАЯВКЕ = { orderId: { not: null } };

/**
 * Порядок здесь — не вкусовщина, а требование базы.
 *
 * Половина связей стоит на `Restrict`: пока на заявку смотрит хоть один
 * расход или документ, удалить её нельзя. Поэтому идём от листьев к корню,
 * и заявка удаляется последней из своей ветки.
 */
const шаги = () => {
    const шаг = (имя, модель, where) => ({
        имя,
        считать: () => модель.count(where ? { where } : undefined),
        удалять: () => модель.deleteMany(where ? { where } : {}),
    });

    return [
        // ---- Бухгалтерия: от строк к самим документам ----
        шаг('Разноска оплат по документам', prisma.accountingPaymentAllocation),
        шаг('Доли платежей по заявкам', prisma.paymentOrderShare),
        шаг('Заявки в бухгалтерских документах', prisma.accountingDocumentOrder),
        шаг('Строки актов сверки', prisma.accountingReconciliationLine),
        шаг('Строки счетов и актов', prisma.accountingDocumentLine),
        шаг('Связи документов между собой', prisma.accountingDocumentLink),
        шаг('Счета, акты, накладные', prisma.accountingDocument),
        шаг('Ссылки на акты сверки', prisma.sharedReportLink),

        // ---- Деньги ----
        шаг('Платежи', prisma.payment),
        шаг('Движения по счетам', prisma.financeOperation),
        шаг('Переоценка валют (строки)', prisma.currencyRevaluationLine),
        шаг('Переоценка валют', prisma.currencyRevaluation),
        шаг('Расходы по заявкам', prisma.expense, ПО_ЗАЯВКЕ),
        шаг('Доходы по заявкам', prisma.income, ПО_ЗАЯВКЕ),
        ...(С_ПРОЧИМИ_ДЕНЬГАМИ
            ? [
                шаг('Расходы без заявки', prisma.expense, БЕЗ_ЗАЯВКИ),
                шаг('Доходы без заявки', prisma.income, БЕЗ_ЗАЯВКИ),
            ]
            : []),

        // ---- Зарплата и бонусы, начисленные за рейсы ----
        шаг('Бонусы за рейсы', prisma.bonus),
        шаг('Начисления зарплаты', prisma.payrollAccrual),

        // ---- Всё, что висит на самой заявке ----
        шаг('Чеки от контрагентов по заявкам', prisma.orderPaymentProof),
        шаг('Ответственные по заявкам', prisma.orderResponsible),
        шаг('Документы контрагента в заявках', prisma.orderDocument),
        шаг('История правок заявок', prisma.orderChangeLog),
        шаг('Исполнители заявок', prisma.orderAssignee),
        шаг('Проблемы по заявкам', prisma.orderProblem),
        шаг('История статусов', prisma.orderStatusHistory),
        шаг('Точки маршрута', prisma.orderRoutePoint),
        шаг('Файлы, приложенные к заявкам', prisma.document, ПО_ЗАЯВКЕ),
        шаг('Координаты транспорта', prisma.gpsPoint, ПО_ЗАЯВКЕ),
        шаг('Очередь на складе', prisma.warehouseQueueItem),
        шаг('Запросы на расчёт', prisma.quoteRequest),

        // ---- Сами заявки ----
        шаг('ЗАЯВКИ', prisma.order),

        // ---- Договоры: решение владельца снести вместе с заявками ----
        шаг('Тарифы по маршрутам', prisma.routeTariff),
        шаг('Дополнительные соглашения', prisma.supplementaryAgreement),
        шаг('Договоры', prisma.contract),

        // ---- Журнал действий ----
        шаг('Журнал действий', prisma.auditLog),
    ];
};

/**
 * Нумерация начинается заново.
 *
 * Иначе первая боевая заявка получит номер вроде 148 — с виду обычный, но
 * договориться о нём с бухгалтером контрагента будет нечем: заявок с 1 по
 * 147 не существует.
 */
async function сброситьНумерацию(применять) {
    const счётчики = [
        ['Нумерация заявок', prisma.orderNumbering],
        ['Нумерация запросов на расчёт', prisma.quoteRequestNumbering],
        ['Нумерация бухгалтерских документов', prisma.accountingDocumentNumbering],
    ];

    for (const [имя, модель] of счётчики) {
        const сколько = await модель.count({ where: { nextNumber: { not: 1 } } });
        console.log(`  ${имя.padEnd(42)} ${String(сколько).padStart(6)} → начнутся с №1`);
        if (применять) await модель.updateMany({ data: { nextNumber: 1 } });
    }
}

/** Что остаётся нетронутым — печатается, чтобы это было видно, а не подразумевалось. */
async function показатьЧтоОстаётся() {
    const остаётся = [
        ['Компании', prisma.company],
        ['Сотрудники и контрагенты (люди)', prisma.user],
        ['Транспорт', prisma.vehicle],
        ['Адреса и склады', prisma.location],
        ['Входящее сальдо контрагентов', prisma.counterpartyOpeningBalance],
        ['Закрытые периоды', prisma.closedPeriod],
        ['Обращения в поддержку', prisma.supportTicket],
        ['Схемы зарплаты', prisma.payrollScheme],
        ['Подписки компаний', prisma.companySubscription],
    ];
    console.log('\nОстаётся нетронутым:');
    for (const [имя, модель] of остаётся) {
        console.log(`  ${имя.padEnd(42)} ${String(await модель.count()).padStart(6)}`);
    }
}

(async () => {
    const список = шаги();

    console.log(УДАЛЯТЬ ? '\n=== ЧИСТКА (удаление) ===\n' : '\n=== ПОДСЧЁТ (ничего не удаляется) ===\n');

    let всего = 0;
    for (const ш of список) {
        всего += await ш.считать();
    }

    if (!УДАЛЯТЬ) {
        for (const ш of список) {
            const n = await ш.считать();
            console.log(`  ${ш.имя.padEnd(42)} ${String(n).padStart(6)}`);
        }
        console.log(`  ${'—'.repeat(42)} ${'—'.repeat(6)}`);
        console.log(`  ${'ВСЕГО ЗАПИСЕЙ К УДАЛЕНИЮ'.padEnd(42)} ${String(всего).padStart(6)}`);
        await сброситьНумерацию(false);
        await показатьЧтоОстаётся();

        if (!С_ПРОЧИМИ_ДЕНЬГАМИ) {
            const прочие = await prisma.expense.count({ where: БЕЗ_ЗАЯВКИ })
                + await prisma.income.count({ where: БЕЗ_ЗАЯВКИ });
            console.log(
                `\nРасходов и доходов без привязки к заявке: ${прочие}.`
                + '\nОни остаются. Если это тоже проверочные — запустить с --with-standalone-finance.',
            );
        }

        console.log('\nНичего не удалено. Для удаления: --confirm\n');
        await prisma.$disconnect();
        return;
    }

    // Одной транзакцией: чистка, оборванная посередине, оставила бы счета
    // без заявок и долги без документов — состояние хуже исходного.
    const итог = [];
    await prisma.$transaction(async () => {
        for (const ш of список) {
            const { count } = await ш.удалять();
            итог.push([ш.имя, count]);
        }
    }, { timeout: 300_000 });

    for (const [имя, n] of итог) {
        console.log(`  ${имя.padEnd(42)} ${String(n).padStart(6)}`);
    }
    console.log(`  ${'—'.repeat(42)} ${'—'.repeat(6)}`);
    console.log(`  ${'УДАЛЕНО ЗАПИСЕЙ'.padEnd(42)} ${String(итог.reduce((s, [, n]) => s + n, 0)).padStart(6)}`);

    console.log('\nНумерация:');
    await сброситьНумерацию(true);
    await показатьЧтоОстаётся();

    console.log('\nГотово.\n');
    await prisma.$disconnect();
})().catch(async (e) => {
    console.error('\nОШИБКА — ничего не удалено (транзакция откачена):\n', e);
    await prisma.$disconnect();
    process.exit(1);
});
