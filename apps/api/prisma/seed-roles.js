/**
 * Стенд для проверки платформы глазами ролей.
 *
 * Задача владельца: пройти путь логиста, бухгалтера, завсклада и
 * администратора на настоящих данных — от создания заявки до завершения,
 * с зарплатой, расходами и взаиморасчётами. На пустой базе такую проверку
 * не сделать: половина экранов покажет «нет данных» и промолчит о том, что
 * на объёме она разъезжается.
 *
 * Поэтому данных здесь намеренно много: 6 городов, 48 адресов, 20
 * контрагентов. Именно на таком объёме видно, где выпадающий список
 * перестаёт работать и нужен отдельный поиск.
 *
 * Запуск: DATABASE_URL=... node prisma/seed-roles.js
 * Пароль у всех: Test12345!
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const D = (v) => new Prisma.Decimal(v);

/** Детерминированный «случай»: стенд обязан быть воспроизводимым. */
let seed = 20260728;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const day = (offsetDays) => {
    const d = new Date('2026-07-28T09:00:00+05:00');
    d.setDate(d.getDate() + offsetDays);
    return d;
};
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const CITIES = [
    ['Алматы', 43.238, 76.889],
    ['Астана', 51.169, 71.449],
    ['Шымкент', 42.317, 69.596],
    ['Караганда', 49.807, 73.085],
    ['Актобе', 50.283, 57.167],
    ['Атырау', 47.094, 51.924],
];

const STREETS = [
    'ул. Рыскулова', 'пр. Райымбека', 'ул. Северное кольцо', 'ул. Бекмаханова',
    'ул. Тлендиева', 'пр. Сейфуллина', 'ул. Толе би', 'ул. Кабдолова',
];

async function main() {
    console.log('Готовлю стенд…');

    // ── Компании ────────────────────────────────────────────────────────
    const us = await prisma.company.upsert({
        where: { id: 'rl-us' },
        update: { name: 'ТОО «ЛогиКор Экспедиция»' },
        create: {
            id: 'rl-us', name: 'ТОО «ЛогиКор Экспедиция»', bin: '180340001234',
            type: 'FORWARDER', address: 'Алматы, ул. Рыскулова 103',
            phone: '+77272001010', email: 'office@logicore.kz',
        },
    });

    const CLIENTS = [
        ['Магнум Кэш энд Керри', '030140001111'], ['Small Distribution', '060240002222'],
        ['Кока-Кола Алматы Боттлерс', '940740003333'], ['Эфес Казахстан', '971140004444'],
        ['РГ Бранды', '010540005555'], ['Технодом Оператор', '050840006666'],
        ['Меломан', '990240007777'], ['Sulpak Electronics', '020340008888'],
        ['Аруана Агро', '110640009999'], ['Караганда Металл', '070141110000'],
        ['Шымкент Май', '040841112222'], ['Актобе Нефть Сервис', '130241113333'],
    ];
    const CARRIERS = [
        ['ИП Сериков А.', '830512300111'], ['ТОО «КазТрансЛайн»', '090741114444'],
        ['ИП Нурланов Б.', '790812300222'], ['ТОО «Степь Логистик»', '120341115555'],
        ['ИП Досжанов К.', '881012300333'], ['ТОО «Алтын Жол»', '150641116666'],
        ['ИП Ермеков С.', '910212300444'], ['ТОО «Батыс Транс»', '160841117777'],
    ];

    const clients = [];
    for (let i = 0; i < CLIENTS.length; i++) {
        const [name, bin] = CLIENTS[i];
        clients.push(await prisma.company.upsert({
            where: { id: `rl-cl-${i}` },
            update: {},
            create: {
                id: `rl-cl-${i}`, name, bin, type: 'CUSTOMER',
                address: `${pick(CITIES)[0]}, ${pick(STREETS)} ${int(1, 200)}`,
                phone: `+7727${int(2000000, 2999999)}`,
            },
        }));
    }

    const carriers = [];
    for (let i = 0; i < CARRIERS.length; i++) {
        const [name, bin] = CARRIERS[i];
        carriers.push(await prisma.company.upsert({
            where: { id: `rl-ca-${i}` },
            update: {},
            create: {
                id: `rl-ca-${i}`, name, bin, type: 'FORWARDER',
                address: `${pick(CITIES)[0]}, ${pick(STREETS)} ${int(1, 200)}`,
                phone: `+7701${int(2000000, 2999999)}`,
            },
        }));
    }

    // Партнёрства — иначе контрагенты не появятся в выборе заявки.
    for (const c of [...clients, ...carriers]) {
        await prisma.partnership.upsert({
            where: { requesterId_recipientId: { requesterId: us.id, recipientId: c.id } },
            update: { status: 'ACCEPTED' },
            create: { requesterId: us.id, recipientId: c.id, status: 'ACCEPTED' },
        });
    }

    // ── Отделы ──────────────────────────────────────────────────────────
    const dept = async (id, name) => prisma.department.upsert({
        where: { id }, update: {}, create: { id, name, companyId: us.id },
    });
    const dLog = await dept('rl-d-log', 'Логистика');
    const dBuh = await dept('rl-d-buh', 'Бухгалтерия');
    const dSkl = await dept('rl-d-skl', 'Склад');

    // ── Сотрудники ──────────────────────────────────────────────────────
    const hash = await bcrypt.hash('Test12345!', 10);
    const emp = async (email, first, last, role, permissions, departmentId, extra = {}) => {
        const u = await prisma.user.upsert({
            where: { email },
            update: { passwordHash: hash, role, permissions, departmentId, companyId: us.id, isActive: true },
            create: {
                email, passwordHash: hash, firstName: first, lastName: last, role,
                permissions, departmentId, companyId: us.id, isActive: true,
                phone: `+7701${int(1000000, 9999999)}`, ...extra,
            },
        });
        await prisma.userCompanyRelation.upsert({
            where: { userId_companyId: { userId: u.id, companyId: us.id } },
            update: { role },
            create: { userId: u.id, companyId: us.id, role },
        });
        return u;
    };

    const ALL = ['orders', 'documents', 'accounting', 'partners', 'tracking', 'drivers'];

    const admin = await emp('admin@lk.kz', 'Евгений', 'Заруцкий', 'COMPANY_ADMIN', ALL, dLog.id, { position: 'Директор' });
    const logist1 = await emp('logist@lk.kz', 'Айгуль', 'Сериккызы', 'LOGISTICIAN',
        ['orders', 'tracking', 'partners', 'drivers'], dLog.id, { position: 'Логист' });
    const logist2 = await emp('logist2@lk.kz', 'Марат', 'Абдуллин', 'LOGISTICIAN',
        ['orders', 'tracking', 'partners', 'drivers'], dLog.id, { position: 'Логист' });
    const buh = await emp('buh@lk.kz', 'Гульнара', 'Ахметова', 'ACCOUNTANT',
        ['accounting', 'documents', 'orders'], dBuh.id, { position: 'Главный бухгалтер' });
    const sklad = await emp('sklad@lk.kz', 'Ержан', 'Тулеуов', 'WAREHOUSE_MANAGER',
        ['tracking', 'orders'], dSkl.id, { position: 'Заведующий складом' });

    const DRIVERS = [
        ['Иван', 'Петров', '123 ABC 02', 'Тент'],
        ['Асхат', 'Жумабаев', '456 KZA 01', 'Реф'],
        ['Сергей', 'Ким', '789 BCD 05', 'Тент'],
        ['Данияр', 'Оспанов', '321 XYZ 02', 'Изотерм'],
    ];
    const drivers = [];
    for (let i = 0; i < DRIVERS.length; i++) {
        const [f, l, plate, vtype] = DRIVERS[i];
        drivers.push(await emp(`driver${i + 1}@lk.kz`, f, l, 'DRIVER', [], null, {
            vehiclePlate: plate, vehicleType: vtype, vehicleModel: pick(['Mercedes Actros', 'Volvo FH', 'MAN TGX', 'Scania R']),
            isTrackable: true, position: 'Водитель',
        }));
    }

    for (let i = 0; i < DRIVERS.length; i++) {
        const [, , plate, vtype] = DRIVERS[i];
        await prisma.vehicle.upsert({
            where: { id: `rl-v-${i}` }, update: {},
            create: { id: `rl-v-${i}`, companyId: us.id, type: vtype, plate, model: 'Полуприцеп 82 м³', trailerNumber: `KZ ${int(100, 999)}` },
        });
    }

    // ── Адреса ──────────────────────────────────────────────────────────
    // Их специально много: на 48 адресах выпадающий список уже нечитаем.
    const locations = [];
    let li = 0;
    for (const [city, lat, lng] of CITIES) {
        for (let k = 0; k < 8; k++) {
            const owner = pick([...clients, ...carriers]);
            const kind = pick(['Склад', 'Распределительный центр', 'Терминал', 'Площадка', 'Магазин']);
            locations.push(await prisma.location.upsert({
                where: { id: `rl-loc-${li}` },
                update: {},
                create: {
                    id: `rl-loc-${li}`,
                    name: `${kind} «${owner.name.replace(/^(ТОО|ИП)\s*«?/, '').replace(/»$/, '').slice(0, 18)}» ${city}`,
                    address: `${city}, ${pick(STREETS)} ${int(1, 240)}`,
                    city,
                    latitude: lat + (rnd() - 0.5) * 0.2,
                    longitude: lng + (rnd() - 0.5) * 0.2,
                    contactName: pick(['Асель', 'Бауыржан', 'Ольга', 'Тимур', 'Жанна']),
                    contactPhone: `+7701${int(1000000, 9999999)}`,
                    emails: k % 3 === 0 ? `sklad${li}@${owner.name.match(/[a-zA-Z]+/)?.[0]?.toLowerCase() || 'mail'}.kz` : null,
                    companyId: owner.id,
                    createdById: admin.id,
                },
            }));
            li++;
        }
    }

    // ── Счета и статьи ──────────────────────────────────────────────────
    const account = async (id, name, kind, opening) => prisma.financeAccount.upsert({
        where: { id }, update: {},
        create: { id, companyId: us.id, name, kind, openingBalance: D(opening), openingDate: day(-120), isDefault: kind === 'BANK' && id === 'rl-acc-halyk' },
    });
    const accHalyk = await account('rl-acc-halyk', 'Halyk Bank — KZT', 'BANK', 4_500_000);
    const accKaspi = await account('rl-acc-kaspi', 'Kaspi Bank — KZT', 'BANK', 1_200_000);
    const accCash = await account('rl-acc-cash', 'Касса', 'CASH', 350_000);

    const cat = async (id, name, direction, costType) => prisma.financeCategory.upsert({
        where: { id }, update: {},
        create: { id, companyId: us.id, name, direction, costType },
    });
    const catFreight = await cat('rl-cat-freight', 'Оплата перевозки', 'IN', null);
    const catFuel = await cat('rl-cat-fuel', 'ГСМ', 'OUT', 'PER_ORDER');
    const catCarrier = await cat('rl-cat-carrier', 'Услуги перевозчика', 'OUT', 'PER_ORDER');
    const catSalary = await cat('rl-cat-salary', 'Зарплата', 'OUT', 'GENERAL');
    const catRent = await cat('rl-cat-rent', 'Аренда офиса', 'OUT', 'GENERAL');

    // ── Заявки ──────────────────────────────────────────────────────────
    // Раскладываем на три месяца и по всем стадиям, чтобы журналы,
    // отчёты и зарплата считались на настоящей истории, а не на одном рейсе.
    const STATUSES = [
        ['COMPLETED', 14], ['COMPLETED', 12], ['IN_TRANSIT', 3], ['ASSIGNED', 2],
        ['PENDING', 2], ['DRAFT', 1], ['AT_DELIVERY', 1], ['LOADING', 1],
        ['CANCELLED', 1], ['PROBLEM', 1],
    ];
    const statusPool = STATUSES.flatMap(([s, n]) => Array(n).fill(s));

    const CARGO = [
        ['Продукты питания в коробках', 'Тент', 'Тарно-штучные'],
        ['Напитки в паллетах', 'Тент', 'Тарно-штучные'],
        ['Бытовая техника', 'Тент', 'Хрупкие'],
        ['Замороженная продукция', 'Реф', 'Скоропортящиеся'],
        ['Стройматериалы', 'Открытый', 'Навалочные'],
        ['Мука в мешках', 'Тент', 'Сыпучие'],
    ];

    const orders = [];
    await prisma.orderNumbering.upsert({
        where: { companyId: us.id }, update: {},
        create: { companyId: us.id, prefix: 'ЛК-', nextNumber: 200 },
    }).catch(() => {});

    for (let i = 0; i < statusPool.length; i++) {
        const status = statusPool[i];
        const created = day(-int(1, 88));
        const client = pick(clients);
        const carrier = pick(carriers);
        const manager = rnd() > 0.45 ? logist1 : logist2;
        const driver = pick(drivers);
        const [cargo, transport, nature] = pick(CARGO);

        const customerPrice = int(28, 140) * 10_000;
        const driverCost = Math.round(customerPrice * (0.68 + rnd() * 0.16));
        const hasVat = rnd() > 0.4;

        const from = pick(locations);
        let to = pick(locations);
        while (to.id === from.id) to = pick(locations);

        const done = status === 'COMPLETED';
        const customerPaid = done && rnd() > 0.35;
        const driverPaid = done && rnd() > 0.3;

        const palletKind = pick(['EUR', 'FIN', 'STANDARD']);
        const order = await prisma.order.upsert({
            where: { orderNumber: `ЛК-${200 + i}` },
            update: {},
            create: {
                orderNumber: `ЛК-${200 + i}`,
                status,
                createdAt: created,
                completedAt: done ? new Date(created.getTime() + 3 * 864e5) : null,
                customerId: admin.id,
                customerCompanyId: client.id,
                forwarderId: us.id,
                // Перевозчик пишется в subForwarderId — именно так его
                // сохраняет мастер создания заявки. Если положить только в
                // partnerId, колонка «Перевозчик» в журнале покажет нашу же
                // компанию, и стенд соврёт про поломку, которой нет.
                partnerId: carrier.id,
                subForwarderId: carrier.id,
                subForwarderPrice: D(driverCost),
                responsibleManagerId: manager.id,
                driverId: ['DRAFT', 'PENDING'].includes(status) ? null : driver.id,
                assignedDriverName: ['DRAFT', 'PENDING'].includes(status) ? null : `${driver.lastName} ${driver.firstName}`,
                assignedDriverPhone: driver.phone,
                assignedDriverPlate: driver.vehiclePlate,
                assignedAt: ['DRAFT', 'PENDING'].includes(status) ? null : created,
                cargoDescription: cargo,
                cargoType: transport,
                natureOfCargo: nature,
                cargoWeight: int(3, 22) * 1000,
                cargoVolume: int(20, 86),
                palletCount: int(8, 33),
                pallets: [{ kind: palletKind, count: int(4, 20) }, { kind: 'CUSTOM', count: int(2, 8), length: 120, width: 100, height: 160 }],
                loadingTypes: pick([['REAR'], ['SIDE'], ['REAR', 'SIDE'], ['TOP', 'SIDE']]),
                packagingTypes: pick([['PALLETS'], ['PALLETS', 'BOXES'], ['BAGS'], ['BIG_BAGS', 'PALLETS']]),
                customerPrice: D(customerPrice),
                driverCost: D(driverCost),
                hasVat, vatRate: D(hasVat ? 16 : 0),
                executorHasVat: rnd() > 0.6, executorVatRate: D(rnd() > 0.6 ? 16 : 0),
                isCustomerPaid: customerPaid,
                customerPaidAt: customerPaid ? new Date(created.getTime() + 20 * 864e5) : null,
                isDriverPaid: driverPaid,
                driverPaidAt: driverPaid ? new Date(created.getTime() + 10 * 864e5) : null,
                customerPaymentCondition: pick(['По факту выгрузки', 'Отсрочка 15 дней', 'Отсрочка 30 дней', 'Предоплата 50%']),
                customerPaymentDate: new Date(created.getTime() + int(10, 35) * 864e5),
                driverPaymentCondition: pick(['По факту выгрузки', 'Отсрочка 7 дней']),
                requirements: rnd() > 0.7 ? 'Нужны ремни и уголки. Пропуск на территорию заказать за сутки.' : null,
                isConfirmed: !['DRAFT', 'PENDING'].includes(status),
                routePoints: {
                    create: [
                        { locationId: from.id, pointType: 'PICKUP', sequence: 1, expectedDate: created },
                        { locationId: to.id, pointType: 'DELIVERY', sequence: 2, expectedDate: new Date(created.getTime() + 2 * 864e5) },
                    ],
                },
            },
        });
        orders.push(order);

        await prisma.orderResponsible.upsert({
            where: { orderId_companyId: { orderId: order.id, companyId: us.id } },
            update: { userId: manager.id },
            create: { orderId: order.id, companyId: us.id, userId: manager.id },
        });

        // Деньги по завершённым рейсам — иначе отчёты пустые.
        if (customerPaid) {
            await prisma.payment.create({
                data: {
                    companyId: us.id, orderId: order.id, counterpartyId: client.id,
                    direction: 'IN', amount: D(customerPrice), date: new Date(created.getTime() + 20 * 864e5),
                    method: 'BANK', accountId: accHalyk.id, categoryId: catFreight.id,
                    note: `Оплата по заявке ЛК-${200 + i}`, createdById: buh.id,
                },
            });
        }
        if (driverPaid) {
            await prisma.payment.create({
                data: {
                    companyId: us.id, orderId: order.id, counterpartyId: carrier.id,
                    direction: 'OUT', amount: D(driverCost), date: new Date(created.getTime() + 10 * 864e5),
                    method: 'BANK', accountId: accHalyk.id, categoryId: catCarrier.id,
                    note: `Оплата перевозчику по ЛК-${200 + i}`, createdById: buh.id,
                },
            });
        }
        if (done && rnd() > 0.6) {
            await prisma.expense.create({
                data: {
                    companyId: us.id, orderId: order.id, date: new Date(created.getTime() + 864e5),
                    category: 'fuel', description: `ГСМ по рейсу ЛК-${200 + i}`,
                    amount: D(int(30, 90) * 1000), accountId: accCash.id, createdById: logist1.id,
                },
            });
        }
    }

    // ── Постоянные расходы ──────────────────────────────────────────────
    for (let m = 0; m < 3; m++) {
        const d = day(-m * 30 - 5);
        await prisma.expense.createMany({
            data: [
                { companyId: us.id, date: d, category: 'rent', description: 'Аренда офиса', amount: D(450_000), accountId: accHalyk.id, createdById: buh.id },
                { companyId: us.id, date: d, category: 'salary', description: 'Зарплата сотрудников', amount: D(2_150_000), accountId: accHalyk.id, createdById: buh.id },
                { companyId: us.id, date: d, category: 'communication', description: 'Связь и интернет', amount: D(85_000), accountId: accKaspi.id, createdById: buh.id },
                { companyId: us.id, date: d, category: 'tax', description: 'Налоги и отчисления', amount: D(680_000), accountId: accHalyk.id, createdById: buh.id },
            ],
        });
    }

    // ── Зарплата логистов ───────────────────────────────────────────────
    // Общая схема компании и персональная у второго логиста — так видно,
    // перебивает ли персональная общую.
    await prisma.payrollScheme.upsert({
        where: { companyId_userId: { companyId: us.id, userId: null } },
        update: {},
        create: {
            companyId: us.id, userId: null, type: 'HYBRID',
            fixedAmount: D(250_000), percentValue: D(10), percentBase: 'MARGIN',
            accrualStatus: 'CUSTOMER_PAID',
        },
    }).catch(async () => {
        // @@unique([companyId, userId]) с null ведёт себя в Postgres иначе —
        // подстраховываемся поиском.
        const exists = await prisma.payrollScheme.findFirst({ where: { companyId: us.id, userId: null } });
        if (!exists) {
            await prisma.payrollScheme.create({
                data: {
                    companyId: us.id, userId: null, type: 'HYBRID',
                    fixedAmount: D(250_000), percentValue: D(10), percentBase: 'MARGIN',
                    accrualStatus: 'CUSTOMER_PAID',
                },
            });
        }
    });

    await prisma.payrollScheme.upsert({
        where: { companyId_userId: { companyId: us.id, userId: logist2.id } },
        update: {},
        create: {
            companyId: us.id, userId: logist2.id, type: 'PERCENT',
            percentValue: D(15), percentBase: 'MARGIN', accrualStatus: 'CUSTOMER_PAID',
        },
    });

    const kpiExists = await prisma.payrollKpiRule.findFirst({ where: { companyId: us.id } });
    if (!kpiExists) {
        await prisma.payrollKpiRule.create({
            data: {
                companyId: us.id, userId: null, metric: 'COMPLETED_ORDERS_MONTH',
                threshold: 8, bonusAmount: D(75_000),
            },
        });
    }

    // Начисления за два прошлых месяца — чтобы «Зарплата» не была пустой.
    for (const manager of [logist1, logist2]) {
        for (let m = 1; m <= 2; m++) {
            const period = monthKey(day(-m * 30));
            await prisma.payrollAccrual.upsert({
                where: { userId_periodMonth_kind_kpiRuleId: { userId: manager.id, periodMonth: period, kind: 'SALARY', kpiRuleId: null } },
                update: {},
                create: {
                    companyId: us.id, userId: manager.id, kind: 'SALARY',
                    amount: manager.id === logist2.id ? D(0) : D(250_000),
                    periodMonth: period,
                },
            }).catch(() => {});
        }
    }

    const counts = {
        компании: await prisma.company.count(),
        сотрудники: await prisma.user.count({ where: { companyId: us.id } }),
        адреса: await prisma.location.count(),
        заявки: await prisma.order.count(),
        платежи: await prisma.payment.count(),
        расходы: await prisma.expense.count(),
    };
    console.log('Готово:', counts);
    console.log('\nВход (пароль у всех Test12345!):');
    console.log('  admin@lk.kz    — директор, видит всё');
    console.log('  logist@lk.kz   — логист Айгуль');
    console.log('  logist2@lk.kz  — логист Марат');
    console.log('  buh@lk.kz      — бухгалтер Гульнара');
    console.log('  sklad@lk.kz    — завсклад Ержан');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
