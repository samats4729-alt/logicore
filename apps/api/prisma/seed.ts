import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Создаём тестового админа
    const adminPassword = await bcrypt.hash('admin123', 10);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@logcomp.kz' },
        update: {},
        create: {
            email: 'admin@logcomp.kz',
            phone: '+77001234567',
            passwordHash: adminPassword,
            firstName: 'Админ',
            lastName: 'Системы',
            role: UserRole.ADMIN,
        },
    });
    console.log(`✅ Admin created: ${admin.email}`);

    // Тестовый водитель
    const driver = await prisma.user.upsert({
        where: { phone: '+77771234567' },
        update: {},
        create: {
            phone: '+77771234567',
            firstName: 'Тест',
            lastName: 'Водитель',
            role: UserRole.DRIVER,
            vehiclePlate: '123ABC01',
            vehicleModel: 'MAN TGX',
        },
    });
    console.log(`✅ Driver created: ${driver.phone}`);

    // Тестовый заказчик
    const customerPassword = await bcrypt.hash('customer123', 10);
    const customer = await prisma.user.upsert({
        where: { email: 'customer@test.kz' },
        update: {},
        create: {
            email: 'customer@test.kz',
            phone: '+77051234567',
            passwordHash: customerPassword,
            firstName: 'Тест',
            lastName: 'Заказчик',
            role: UserRole.LOGISTICIAN,
        },
    });
    console.log(`✅ Customer created: ${customer.email}`);

    // Тестовая локация (склад)
    const warehouse = await prisma.location.upsert({
        where: { id: 'warehouse-1' },
        update: {},
        create: {
            id: 'warehouse-1',
            name: 'Основной склад',
            address: 'г. Алматы, ул. Логистическая, 1',
            latitude: 43.238949,
            longitude: 76.945780,
            contactName: 'Склад менеджер',
            contactPhone: '+77012345678',
        },
    });
    console.log(`✅ Location created: ${warehouse.name}`);

    // Вторая локация (точка доставки)
    const deliveryPoint = await prisma.location.upsert({
        where: { id: 'delivery-1' },
        update: {},
        create: {
            id: 'delivery-1',
            name: 'ТРЦ Мега Алматы',
            address: 'г. Алматы, ул. Розыбакиева, 247',
            latitude: 43.201920,
            longitude: 76.893550,
            contactName: 'Приёмка товара',
            contactPhone: '+77019876543',
        },
    });
    console.log(`✅ Delivery location created: ${deliveryPoint.name}`);

    // Тестовый заказ с назначенным водителем
    const testOrder = await prisma.order.upsert({
        where: { orderNumber: 'TEST-001' },
        update: { driverId: driver.id },
        create: {
            orderNumber: 'TEST-001',
            customerId: customer.id,
            driverId: driver.id,
            status: 'ASSIGNED',
            cargoDescription: 'Тестовый груз - электроника',
            cargoWeight: 500,
            pickupLocationId: warehouse.id,
        },
    });
    console.log(`✅ Test order created: ${testOrder.orderNumber} (assigned to driver)`);

    // Добавляем точку доставки
    await prisma.orderDeliveryPoint.upsert({
        where: { id: 'dp-1' },
        update: {},
        create: {
            id: 'dp-1',
            orderId: testOrder.id,
            locationId: deliveryPoint.id,
            sequence: 1,
        },
    });
    console.log(`✅ Delivery point added to order`);

    console.log('🎉 Seeding completed!');
    console.log('');
    console.log('📋 Test credentials:');
    console.log('   Admin: admin@logcomp.kz / admin123');
    console.log('   Customer: customer@test.kz / customer123');
    console.log('   Driver: +77771234567 (SMS auth, code: 1234)');
    console.log('');
    console.log('📦 Test order TEST-001 assigned to test driver');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
