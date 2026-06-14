import 'dotenv/config';
import { PrismaClient, PaymentDirection, PaymentMethod } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Starting Stage A Payment Data Migration...');

    // 1. Migrate Order boolean flags
    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { isCustomerPaid: true },
                { isDriverPaid: true },
                { isSubForwarderPaid: true },
            ]
        }
    });

    console.log(`Found ${orders.length} orders to inspect for payments...`);

    let migratedPaymentsCount = 0;

    for (const order of orders) {
        // Customer payment (IN)
        if (order.isCustomerPaid && order.customerPrice && order.customerPrice > 0) {
            const date = order.customerPaidAt || order.completedAt || order.createdAt;
            const companyId = order.forwarderId || order.partnerId || order.customerCompanyId;
            if (companyId) {
                // Check if this payment already exists
                const existing = await prisma.payment.findFirst({
                    where: {
                        orderId: order.id,
                        direction: PaymentDirection.IN,
                        companyId,
                        isDeleted: false,
                    }
                });

                if (!existing) {
                    await prisma.payment.create({
                        data: {
                            companyId,
                            orderId: order.id,
                            direction: PaymentDirection.IN,
                            amount: order.customerPrice,
                            date: new Date(date),
                            method: PaymentMethod.BANK,
                            note: 'Автоматическая миграция (Оплата от заказчика)',
                            counterpartyId: order.customerCompanyId || undefined,
                        }
                    });
                    migratedPaymentsCount++;
                }

                // If customerCompanyId is a tenant, also create a corresponding OUT payment for them
                if (order.customerCompanyId && order.customerCompanyId !== companyId) {
                    const existingOut = await prisma.payment.findFirst({
                        where: {
                            orderId: order.id,
                            direction: PaymentDirection.OUT,
                            companyId: order.customerCompanyId,
                            isDeleted: false,
                        }
                    });

                    if (!existingOut) {
                        await prisma.payment.create({
                            data: {
                                companyId: order.customerCompanyId,
                                orderId: order.id,
                                direction: PaymentDirection.OUT,
                                amount: order.customerPrice,
                                date: new Date(date),
                                method: PaymentMethod.BANK,
                                note: 'Автоматическая миграция (Оплата экспедитору)',
                                counterpartyId: companyId,
                            }
                        });
                        migratedPaymentsCount++;
                    }
                }
            }
        }

        // Driver payment (OUT)
        if (order.isDriverPaid && order.driverCost && order.driverCost > 0) {
            const date = order.driverPaidAt || order.completedAt || order.createdAt;
            const companyId = order.forwarderId || order.partnerId;
            if (companyId) {
                const existing = await prisma.payment.findFirst({
                    where: {
                        orderId: order.id,
                        direction: PaymentDirection.OUT,
                        companyId,
                        isDeleted: false,
                        note: { contains: 'Водитель' }
                    }
                });

                if (!existing) {
                    await prisma.payment.create({
                        data: {
                            companyId,
                            orderId: order.id,
                            direction: PaymentDirection.OUT,
                            amount: order.driverCost,
                            date: new Date(date),
                            method: PaymentMethod.BANK,
                            note: 'Автоматическая миграция (Оплата водителю)',
                        }
                    });
                    migratedPaymentsCount++;
                }
            }
        }

        // Sub-forwarder payment (OUT)
        if (order.isSubForwarderPaid && order.subForwarderPrice && order.subForwarderPrice > 0) {
            const date = order.subForwarderPaidAt || order.completedAt || order.createdAt;
            const companyId = order.forwarderId || order.partnerId;
            if (companyId) {
                const existing = await prisma.payment.findFirst({
                    where: {
                        orderId: order.id,
                        direction: PaymentDirection.OUT,
                        companyId,
                        isDeleted: false,
                        note: { contains: 'Суб-экспедитор' }
                    }
                });

                if (!existing) {
                    await prisma.payment.create({
                        data: {
                            companyId,
                            orderId: order.id,
                            direction: PaymentDirection.OUT,
                            amount: order.subForwarderPrice,
                            date: new Date(date),
                            method: PaymentMethod.BANK,
                            note: 'Автоматическая миграция (Оплата суб-экспедитору)',
                            counterpartyId: order.subForwarderId || undefined,
                        }
                    });
                    migratedPaymentsCount++;
                }

                // If subForwarderId is a tenant, also create a corresponding IN payment for them
                if (order.subForwarderId) {
                    const existingIn = await prisma.payment.findFirst({
                        where: {
                            orderId: order.id,
                            direction: PaymentDirection.IN,
                            companyId: order.subForwarderId,
                            isDeleted: false,
                        }
                    });

                    if (!existingIn) {
                        await prisma.payment.create({
                            data: {
                                companyId: order.subForwarderId,
                                orderId: order.id,
                                direction: PaymentDirection.IN,
                                amount: order.subForwarderPrice,
                                date: new Date(date),
                                method: PaymentMethod.BANK,
                                note: 'Автоматическая миграция (Получение оплаты от экспедитора)',
                                counterpartyId: companyId,
                            }
                        });
                        migratedPaymentsCount++;
                    }
                }
            }
        }
    }

    console.log(`Migrated ${migratedPaymentsCount} payments from order flags.`);

    // 2. Migrate existing Income records with category in ['order_payment', 'prepayment']
    const manualIncomes = await prisma.income.findMany({
        where: {
            category: { in: ['order_payment', 'prepayment'] },
            isDeleted: false,
        }
    });

    console.log(`Found ${manualIncomes.length} manual incomes with category order_payment/prepayment.`);

    let migratedIncomesCount = 0;
    for (const inc of manualIncomes) {
        await prisma.payment.create({
            data: {
                companyId: inc.companyId,
                orderId: inc.orderId,
                direction: PaymentDirection.IN,
                amount: inc.amount,
                date: inc.date,
                method: PaymentMethod.BANK,
                note: inc.note || 'Миграция поступления: ' + inc.description,
                createdById: inc.createdById,
            }
        });
        await prisma.income.update({
            where: { id: inc.id },
            data: { isDeleted: true }
        });
        migratedIncomesCount++;
    }
    console.log(`Migrated ${migratedIncomesCount} manual incomes.`);

    // 3. Migrate existing Expense records with category in ['driver_payment']
    const manualExpenses = await prisma.expense.findMany({
        where: {
            category: 'driver_payment',
            isDeleted: false,
        }
    });

    console.log(`Found ${manualExpenses.length} manual expenses with category driver_payment.`);

    let migratedExpensesCount = 0;
    for (const exp of manualExpenses) {
        await prisma.payment.create({
            data: {
                companyId: exp.companyId,
                orderId: exp.orderId,
                direction: PaymentDirection.OUT,
                amount: exp.amount,
                date: exp.date,
                method: PaymentMethod.BANK,
                note: exp.note || 'Миграция расхода: ' + exp.description,
                createdById: exp.createdById,
            }
        });
        await prisma.expense.update({
            where: { id: exp.id },
            data: { isDeleted: true }
        });
        migratedExpensesCount++;
    }
    console.log(`Migrated ${migratedExpensesCount} manual expenses.`);

    console.log('Migration completed successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
