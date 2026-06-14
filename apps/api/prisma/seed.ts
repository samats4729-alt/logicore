import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
console.log('DEBUG: DATABASE_URL is', connectionString ? 'DEFINED' : 'UNDEFINED');
console.log('DEBUG: Connection string starts with:', connectionString?.substring(0, 15) + '...');
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    if (process.env.WIPE_DB_ONCE === 'true') {
        console.log('⚠️ WIPE_DB_ONCE is enabled. TRUNCATING ALL TABLES...');
        try {
            await prisma.$executeRawUnsafe(`
                DO $$ DECLARE
                    r RECORD;
                BEGIN
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
                        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                END $$;
            `);
            console.log('✅ DATABASE WIPED SUCCESSFULLY');
        } catch (e) {
            console.error('❌ Failed to wipe DB:', e);
        }
    }

    console.log('🌱 Seeding database...');

    // Создаём тестового админа
    const adminPassword = await bcrypt.hash('admin123', 12);

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

    // Тестовая компания
    let testCompany = await prisma.company.findFirst({
        where: { bin: '123456789012' }
    });
    if (!testCompany) {
        testCompany = await prisma.company.create({
            data: {
                name: 'Тестовая логистическая компания',
                bin: '123456789012',
                address: 'г. Алматы, ул. Тестовая, 1',
                phone: '+77271234567',
                email: 'info@test.kz',
            },
        });
    }
    console.log(`✅ Test Company created: ${testCompany.name}`);

    // Тестовый водитель
    let driver = await prisma.user.findFirst({
        where: { phone: '+77771234567', companyId: testCompany.id }
    });
    if (!driver) {
        driver = await prisma.user.create({
            data: {
                phone: '+77771234567',
                firstName: 'Тест',
                lastName: 'Водитель',
                role: UserRole.DRIVER,
                vehiclePlate: '123ABC01',
                vehicleModel: 'MAN TGX',
                companyId: testCompany.id,
            },
        });
    }
    console.log(`✅ Driver created: ${driver.phone}`);

    // Тестовый заказчик
    const customerPassword = await bcrypt.hash('customer123', 12);
    const customer = await prisma.user.upsert({
        where: { email: 'customer@test.kz' },
        update: { companyId: testCompany.id },
        create: {
            email: 'customer@test.kz',
            phone: '+77051234567',
            passwordHash: customerPassword,
            firstName: 'Тест',
            lastName: 'Заказчик',
            role: UserRole.LOGISTICIAN,
            companyId: testCompany.id,
        },
    });
    console.log(`✅ Customer created: ${customer.email}`);

    // Тестовая локация (склад)
    const warehouse = await prisma.location.upsert({
        where: { id: 'warehouse-1' },
        update: {
            city: 'Алматы',
        },
        create: {
            id: 'warehouse-1',
            name: 'Основной склад',
            address: 'г. Алматы, ул. Логистическая, 1',
            latitude: 43.238949,
            longitude: 76.945780,
            contactName: 'Склад менеджер',
            contactPhone: '+77012345678',
            city: 'Алматы',
        },
    });
    console.log(`✅ Location created: ${warehouse.name}`);

    // Вторая локация (точка доставки)
    const deliveryPoint = await prisma.location.upsert({
        where: { id: 'delivery-1' },
        update: {
            city: 'Алматы',
        },
        create: {
            id: 'delivery-1',
            name: 'ТРЦ Мега Алматы',
            address: 'г. Алматы, ул. Розыбакиева, 247',
            latitude: 43.201920,
            longitude: 76.893550,
            contactName: 'Приёмка товара',
            contactPhone: '+77019876543',
            city: 'Алматы',
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
        },
    });
    console.log(`✅ Test order created: ${testOrder.orderNumber} (assigned to driver)`);

    // Добавляем точки маршрута (Погрузка и Выгрузка)
    await prisma.orderRoutePoint.upsert({
        where: { id: 'rp-pickup-1' },
        update: {},
        create: {
            id: 'rp-pickup-1',
            orderId: testOrder.id,
            locationId: warehouse.id,
            pointType: 'PICKUP',
            sequence: 1,
        },
    });
    console.log(`✅ Pickup point added to order`);

    await prisma.orderRoutePoint.upsert({
        where: { id: 'rp-delivery-1' },
        update: {},
        create: {
            id: 'rp-delivery-1',
            orderId: testOrder.id,
            locationId: deliveryPoint.id,
            pointType: 'DELIVERY',
            sequence: 2,
        },
    });
    console.log(`✅ Delivery point added to order`);

    // Seed Locations Hierarchy
    const { kzCities } = require('./kz_cities');
    console.log(`Loading hierarchical location data...`);

    // 1. Create Country
    const kazakhstan = await prisma.country.upsert({
        where: { code: 'KZ' },
        update: {},
        create: {
            name: 'Казахстан',
            code: 'KZ',
        },
    });
    console.log(`✅ Country created: ${kazakhstan.name}`);

    // 2. Process Regions and Cities
    const regionMap = new Map(); // name -> id

    // Clear existing cities/regions if needed to ensure clean state with new hierarchy
    // (Optional: DELETE logic if schema changed drastically, otherwise upsert is safer)
    await prisma.city.deleteMany({});
    await prisma.region.deleteMany({});
    console.log('🗑️ Cleared existing cities and regions');

    for (const cityData of kzCities) {
        // Find or create Region
        let regionId = regionMap.get(cityData.region);
        if (!regionId) {
            const region = await prisma.region.create({
                data: {
                    name: cityData.region,
                    countryId: kazakhstan.id,
                },
            });
            regionId = region.id;
            regionMap.set(cityData.region, regionId);
            console.log(`  📍 Region created: ${cityData.region}`);
        }

        // Create City
        await prisma.city.create({
            data: {
                name: cityData.name,
                latitude: cityData.latitude,
                longitude: cityData.longitude,
                regionId: regionId,
                countryId: kazakhstan.id,
            },
        });
    }

    console.log(`✅ ${kzCities.length} cities seeded with regions!`);

    // 3. Seed Cargo Types
    console.log('📦 Seeding Cargo Types...');
    const cargoData = [
        {
            name: 'Продукты питания',
            types: ['Фрукты и овощи', 'Мясо и рыба', 'Молочная продукция', 'Бакалея', 'Напитки', 'Консервы']
        },
        {
            name: 'Строительные материалы',
            types: ['Цемент', 'Кирпич', 'Древесина', 'Металлопрокат', 'Стекло', 'Изоляционные материалы']
        },
        {
            name: 'Товары народного потребления',
            types: ['Одежда и обувь', 'Бытовая техника', 'Мебель', 'Спорттовары', 'Игрушки']
        },
        {
            name: 'Промышленное оборудование',
            types: ['Станки', 'Генераторы', 'Запчасти', 'Медицинское оборудование']
        },
        {
            name: 'Сырье',
            types: ['Зерно', 'Уголь', 'Руда', 'Удобрения', 'Химикаты']
        }
    ];

    for (const [index, category] of cargoData.entries()) {
        const cat = await prisma.cargoCategory.upsert({
            where: { name: category.name },
            update: {},
            create: {
                name: category.name,
                sortOrder: index
            }
        });

        // Удаляем старые типы чтобы не было дублей при повторном seed
        await prisma.cargoType.deleteMany({ where: { categoryId: cat.id } });

        for (const [tIndex, typeName] of category.types.entries()) {
            await prisma.cargoType.create({
                data: {
                    name: typeName,
                    categoryId: cat.id,
                    sortOrder: tIndex
                }
            });
        }
    }
    console.log('Cargo types seeded!');

    console.log('Seeding completed!');
    console.log('');
    console.log('Test credentials:');
    console.log('   Admin: admin@logcomp.kz / admin123');
    console.log('   Customer: customer@test.kz / customer123');
    console.log('   Driver: +77771234567 (SMS auth, code: 1234)');
    console.log('');
    console.log('Test order TEST-001 assigned to test driver');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
