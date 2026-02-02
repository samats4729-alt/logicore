
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- CHECKING LAST ORDER ---');
    const order = await prisma.order.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { driver: true, customer: true }
    });

    if (!order) {
        console.log('No orders found.');
        return;
    }

    console.log('Order Number:', order.orderNumber);
    console.log('ID:', order.id);
    console.log('Status:', order.status);
    console.log('Driver ID:', order.driverId);
    if (order.driver) {
        console.log('Driver Name:', order.driver.firstName, order.driver.lastName);
        console.log('Driver Phone:', order.driver.phone);
    } else {
        console.log('Driver: NOT ASSIGNED');
    }

    console.log('--- CHECKING ALL DRIVERS ---');
    const drivers = await prisma.user.findMany({
        where: { role: 'DRIVER' }
    });
    drivers.forEach(d => console.log(`Driver: ${d.firstName} ${d.lastName}, Phone: ${d.phone}, ID: ${d.id}`));
}

main()
    .catch((e) => {
        console.error(e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
