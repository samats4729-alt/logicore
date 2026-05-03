
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetDriverId = 'cmktvh00m000a65mf12htfnzz'; // From the logs
    console.log('--- CHECKING DRIVER ORDERS ---');
    console.log('Target Driver ID:', targetDriverId);

    try {
        // 1. Check Driver exists
        const driver = await prisma.user.findUnique({ where: { id: targetDriverId } });
        console.log('Driver Found:', driver ? 'YES' : 'NO');
        if (driver) console.log('Driver Name:', driver.firstName, driver.lastName);

        // 2. Check Orders
        const orders = await prisma.order.findMany({
            where: { driverId: targetDriverId },
            include: { driver: true }
        });

        console.log('Orders Count:', orders.length);
        orders.forEach(o => {
            console.log(`- Order: ${o.orderNumber}, Status: ${o.status}, DriverField: ${o.driverId}`);
        });

        if (orders.length === 0) {
            console.log('!!! NO ORDERS FOR THIS DRIVER !!!');
            // Check most recent order generally
            const lastOrder = await prisma.order.findFirst({ orderBy: { createdAt: 'desc' } });
            console.log('Latest Order in DB:', lastOrder?.orderNumber, 'Driver:', lastOrder?.driverId);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
