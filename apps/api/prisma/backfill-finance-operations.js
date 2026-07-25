// Фаза 1 (аудит M-8): наполняет FinanceOperation данными из Payment/Income/Expense.
// Только читает исходные таблицы, ничего в них не меняет и не удаляет. Идемпотентен —
// повторный запуск не создаёт дублей (upsert по уникальному индексу [source, sourceId]).
// Запуск: node prisma/backfill-finance-operations.js
const { PrismaClient } = require('@prisma/client');

async function backfillPayments(prisma) {
  const rows = await prisma.payment.findMany();
  console.log(`Payment: найдено ${rows.length} записей.`);
  let count = 0;
  for (const p of rows) {
    await prisma.financeOperation.upsert({
      where: { source_sourceId: { source: 'PAYMENT', sourceId: p.id } },
      create: {
        companyId: p.companyId,
        source: 'PAYMENT',
        sourceId: p.id,
        direction: p.direction,
        amount: p.amount,
        date: p.date,
        categoryId: p.categoryId,
        note: p.note,
        orderId: p.orderId,
        counterpartyId: p.counterpartyId,
        accountId: p.accountId,
        method: p.method,
        createdById: p.createdById,
        isDeleted: p.isDeleted,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      update: {},
    });
    count++;
  }
  console.log(`Payment: перенесено/сверено ${count} записей.`);
}

async function backfillIncomes(prisma) {
  const rows = await prisma.income.findMany();
  console.log(`Income: найдено ${rows.length} записей.`);
  let count = 0;
  for (const i of rows) {
    await prisma.financeOperation.upsert({
      where: { source_sourceId: { source: 'INCOME', sourceId: i.id } },
      create: {
        companyId: i.companyId,
        source: 'INCOME',
        sourceId: i.id,
        direction: 'IN',
        amount: i.amount,
        date: i.date,
        categoryLabel: i.category,
        description: i.description,
        note: i.note,
        orderId: i.orderId,
        accountId: i.accountId,
        createdById: i.createdById,
        isDeleted: i.isDeleted,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      },
      update: {},
    });
    count++;
  }
  console.log(`Income: перенесено/сверено ${count} записей.`);
}

async function backfillExpenses(prisma) {
  const rows = await prisma.expense.findMany();
  console.log(`Expense: найдено ${rows.length} записей.`);
  let count = 0;
  for (const e of rows) {
    await prisma.financeOperation.upsert({
      where: { source_sourceId: { source: 'EXPENSE', sourceId: e.id } },
      create: {
        companyId: e.companyId,
        source: 'EXPENSE',
        sourceId: e.id,
        direction: 'OUT',
        amount: e.amount,
        date: e.date,
        categoryLabel: e.category,
        description: e.description,
        note: e.note,
        orderId: e.orderId,
        accountId: e.accountId,
        createdById: e.createdById,
        isDeleted: e.isDeleted,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      },
      update: {},
    });
    count++;
  }
  console.log(`Expense: перенесено/сверено ${count} записей.`);
}

async function verify(prisma) {
  const [paymentCount, incomeCount, expenseCount, opCount] = await Promise.all([
    prisma.payment.count(),
    prisma.income.count(),
    prisma.expense.count(),
    prisma.financeOperation.count(),
  ]);
  const expected = paymentCount + incomeCount + expenseCount;
  console.log(`Сверка: Payment(${paymentCount}) + Income(${incomeCount}) + Expense(${expenseCount}) = ${expected}; FinanceOperation = ${opCount}`);
  if (expected !== opCount) {
    console.warn('ВНИМАНИЕ: количество не совпадает — проверьте вручную перед тем, как полагаться на FinanceOperation.');
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Starting FinanceOperation backfill (Payment + Income + Expense)...');
    await backfillPayments(prisma);
    await backfillIncomes(prisma);
    await backfillExpenses(prisma);
    await verify(prisma);
    console.log('FinanceOperation backfill completed successfully.');
  } catch (error) {
    console.error('Error during FinanceOperation backfill:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Unhandled error in backfill-finance-operations:', err);
  process.exit(1);
});
