/**
 * Одноразовая очистка тестовых данных. Управляется переменными окружения:
 *
 *   CLEANUP_TEST_DATA=YES_DELETE      — включает очистку (без неё скрипт молча пропускается)
 *   CLEANUP_ALLOW_UNTIL=YYYY-MM-DD    — предохранитель: после этой даты очистка блокируется
 *   CLEANUP_SCOPE=business | full     — business (по умолчанию): заявки/финансы/документы,
 *                                       компании и пользователи остаются;
 *                                       full: дополнительно удаляет всех пользователей и компании,
 *                                       кроме админов и KEEP_EMAILS
 *   KEEP_EMAILS=a@b.kz,c@d.kz         — email пользователей, которых сохранить при full
 *
 * После успешной очистки ОБЯЗАТЕЛЬНО удалите CLEANUP_TEST_DATA из переменных,
 * иначе очистка повторится при следующем деплое (пока не истечёт CLEANUP_ALLOW_UNTIL).
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
    if (process.env.CLEANUP_TEST_DATA !== 'YES_DELETE') {
        console.log('cleanup-test-data: skipped (CLEANUP_TEST_DATA is not set to YES_DELETE)');
        return;
    }

    const allowUntil = process.env.CLEANUP_ALLOW_UNTIL;
    if (!allowUntil || isNaN(Date.parse(allowUntil)) || new Date(allowUntil + 'T23:59:59') < new Date()) {
        console.log('cleanup-test-data: BLOCKED — CLEANUP_ALLOW_UNTIL отсутствует или в прошлом. Установите CLEANUP_ALLOW_UNTIL=YYYY-MM-DD (сегодняшняя дата).');
        return;
    }

    const scope = (process.env.CLEANUP_SCOPE || 'business').toLowerCase();
    const keepEmails = (process.env.KEEP_EMAILS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const prisma = new PrismaClient();
    try {
        console.log(`🧹 cleanup-test-data: scope=${scope}${keepEmails.length ? `, keep=[${keepEmails.join(', ')}]` : ''}`);

        // Бизнес-данные: заявки, финансы, документы, адреса, транспорт, сессии
        const businessTables = [
            'OrderChangeLog', 'OrderAssignee', 'OrderProblem', 'OrderStatusHistory', 'OrderRoutePoint',
            'GpsPoint', 'WarehouseQueueItem', 'Document', 'Payment', 'Income', 'Expense', 'Bonus',
            'Invoice', 'ClosedPeriod', 'FinanceAccount', 'FinanceCategory', 'Contract',
            'SupplementaryAgreement', 'RouteTariff', 'Location', 'Vehicle', 'SupportTicket',
            'Session', 'Invitation', 'Order',
        ];
        await prisma.$executeRawUnsafe(
            `TRUNCATE TABLE ${businessTables.map((t) => `"${t}"`).join(', ')} CASCADE`,
        );
        console.log(`✅ Бизнес-данные очищены (${businessTables.length} таблиц)`);

        if (scope === 'full') {
            const keepUsers = await prisma.user.findMany({
                where: {
                    OR: [
                        { role: 'ADMIN' },
                        ...(keepEmails.length ? [{ email: { in: keepEmails } }] : []),
                    ],
                },
                select: { id: true, companyId: true, email: true },
            });
            const keepUserIds = keepUsers.map((u) => u.id);
            console.log(`Сохраняем пользователей (${keepUsers.length}): ${keepUsers.map((u) => u.email || u.id).join(', ')}`);

            await prisma.partnership.deleteMany({});
            await prisma.department.deleteMany({});
            await prisma.warehouseGate.deleteMany({});
            await prisma.userCompanyRelation.deleteMany({ where: { userId: { notIn: keepUserIds } } });

            const delUsers = await prisma.user.deleteMany({ where: { id: { notIn: keepUserIds } } });
            console.log(`✅ Удалено пользователей: ${delUsers.count}`);

            // Компании: оставляем только связанные с сохранёнными пользователями
            const keptRelations = await prisma.userCompanyRelation.findMany({ select: { companyId: true } });
            const keepCompanyIds = Array.from(new Set([
                ...keepUsers.map((u) => u.companyId).filter(Boolean),
                ...keptRelations.map((r) => r.companyId),
            ]));

            // Снимаем самоссылку created-by, чтобы удаление не упёрлось в FK
            await prisma.$executeRawUnsafe('UPDATE "Company" SET "createdByCompanyId" = NULL');

            const delCompanies = await prisma.company.deleteMany({
                where: keepCompanyIds.length ? { id: { notIn: keepCompanyIds } } : {},
            });
            console.log(`✅ Удалено компаний: ${delCompanies.count}`);
        }

        console.log('');
        console.log('⚠️  ВАЖНО: удалите переменную CLEANUP_TEST_DATA из Railway прямо сейчас,');
        console.log('⚠️  иначе очистка повторится при следующем деплое!');
    } catch (e) {
        console.error('cleanup-test-data failed:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
