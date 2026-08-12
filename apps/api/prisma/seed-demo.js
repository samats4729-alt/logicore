/**
 * Демо-сценарий для ручной и живой проверки кабинета контрагента.
 *
 * Мы — экспедитор. Есть перевозчик-субподрядчик (платим ему) и заказчик
 * (платит нам). По каждой стороне выдаётся публичная ссылка на отчёт:
 * по одной контрагент выставляет счёт, по другой присылает чек.
 *
 * Запуск: DATABASE_URL=... node prisma/seed-demo.js
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const D = (v) => new Prisma.Decimal(v);

async function main() {
    const company = (id, name, bin) => prisma.company.upsert({
        where: { id },
        update: {},
        create: { id, name, bin, type: 'FORWARDER' },
    });

    const us = await company('p3-us', 'ТОО «ЛогиКор Экспедиция»', '123456789012');
    const carrier = await company('p3-carrier', 'ИП Сериков (перевозки)', '210987654321');
    const client = await company('p3-client', 'ТОО «Магнум Дистрибуция»', '555444333222');

    /**
     * Контрагенты из справочника — те, которых мы заводим руками.
     *
     * Так работает большинство перевозчиков и заказчиков: своего кабинета на
     * платформе у них нет, есть наша карточка. Именно в ней живут условия
     * расчётов, и без такой карточки на стенде не видно главного пути —
     * когда НДС и срок оплаты подставляются в рейс сами.
     *
     * У «Алтын Жол» условия заполнены: рейсы с ним проходят проверку сразу.
     * У «Береке» их нет намеренно — на нём видно вторую половину правила:
     * рейс ждёт бухгалтера, договор нельзя заверить, счёт нельзя выставить.
     */
    const directoryCard = (id, name, bin, extra) => prisma.company.upsert({
        where: { id },
        update: extra,
        create: {
            id, name, bin, type: 'FORWARDER',
            isExternal: true, createdByCompanyId: us.id,
            ...extra,
        },
    });

    const altynZhol = await directoryCard('p3-cp-altyn', 'ТОО «Алтын Жол»', '150641116666', {
        isCustomer: false,
        isCarrier: true,
        email: 'buh@altynzhol.kz',
        vatPayer: true,
        vatRate: D(16),
        carrierPaymentDays: 15,
        carrierPaymentFrom: 'ORIGINALS',
    });

    await directoryCard('p3-cp-bereke', 'ИП «Береке Транс»', '870512300456', {
        isCustomer: false,
        isCarrier: true,
        email: 'bereke@mail.kz',
    });

    await directoryCard('p3-cp-magnum', 'ТОО «Магнум Дистрибуция»', '555444333222', {
        isCustomer: true,
        isCarrier: false,
        email: 'buh@magnum.kz',
        vatPayer: true,
        vatRate: D(16),
        invoiceTiming: 'AFTER_UNLOAD',
        customerPaymentDays: 30,
        customerPaymentFrom: 'UNLOAD',
    });

    const hash = await bcrypt.hash('Test12345!', 10);
    const user = (email, first, last, role, companyId, extra = {}) => prisma.user.upsert({
        where: { email },
        update: { passwordHash: hash },
        create: {
            email, passwordHash: hash, firstName: first, lastName: last,
            role, companyId, isActive: true, ...extra,
        },
    });

    const admin = await user('admin@p3.kz', 'Евгений', 'Админ', 'COMPANY_ADMIN', us.id, { phone: '+77010000009' });
    const clientUser = await user('client@p3.kz', 'Данияр', 'Заказчик', 'COMPANY_ADMIN', client.id, { phone: '+77010000002' });
    const driver = await user('driver@p3.kz', 'Иван', 'Иванов', 'DRIVER', us.id, {
        phone: '+77010000077', vehiclePlate: '123 ABC 01',
    });

    /**
     * Менеджер без права «Бухгалтерия» — вторая половина стенда.
     *
     * На одном администраторе не проверить главного: менеджер не должен видеть
     * НДС, сроки оплаты и вкладку «Финансы», а печать на договоре ему
     * недоступна. Пока такого сотрудника на стенде не было, всё это выглядело
     * работающим просто потому, что смотрели под руководителем.
     */
    const manager = await user('manager@p3.kz', 'Алия', 'Менеджер', 'LOGISTICIAN', us.id, {
        phone: '+77010000055',
        permissions: ['orders', 'partners', 'tracking', 'documents'],
    });

    // Роль берётся из связи с компанией — без неё запросы отвечают 401.
    //
    // Связь заводится каждому, а не только администратору. Раньше её имел
    // один admin@p3.kz, и это выглядело как исправная демо-база: заказчик и
    // водитель спокойно входили, а дальше любой запрос отвечал «Пользователь
    // не найден». Вход есть, работы нет — и разобраться по сообщению
    // невозможно.
    for (const [person, company] of [[admin, us], [clientUser, client], [driver, us], [manager, us]]) {
        const relation = await prisma.userCompanyRelation.findFirst({
            where: { userId: person.id, companyId: company.id },
        });
        if (!relation) {
            await prisma.userCompanyRelation.create({
                data: { userId: person.id, companyId: company.id, role: person.role },
            });
        }
    }

    // Последний рейс идёт в пути, остальные завершены.
    //
    // Стенд из одних завершённых рейсов — это стенд, на котором нечего
    // вести: половина кабинета (статусы, мониторинг, документы, которые
    // выдаются по ходу рейса) рассчитана на работу, а показать её не на
    // чем. Проверка «недоступный документ объясняет причину» именно из-за
    // этого и падала: акт нельзя выдать до завершения, а незавершённого
    // рейса на стенде не было.
    const specs = [
        { n: 'ЗК-2601', from: 'Алматы', to: 'Астана', cargo: 'Напитки', cust: 480000, sub: 390000, paidOut: 0, paidIn: 0, kg: 20000, body: 'Тент', places: 22 },
        { n: 'ЗК-2602', from: 'Шымкент', to: 'Алматы', cargo: 'Стройматериалы', cust: 320000, sub: 260000, paidOut: 100000, paidIn: 320000, kg: 22000, body: 'Тент', places: 14 },
        { n: 'ЗК-2603', from: 'Астана', to: 'Караганда', cargo: 'Бытовая техника', cust: 210000, sub: 165000, paidOut: 165000, paidIn: 90000, kg: 12000, body: 'Тент', places: 18 },
        { n: 'ЗК-2604', from: 'Актобе', to: 'Атырау', cargo: 'Трубы', cust: 540000, sub: 445000, paidOut: 0, paidIn: 0, kg: 18000, body: 'Площадка', places: 6 },
        { n: 'ЗК-2605', from: 'Алматы', to: 'Тараз', cargo: 'Продукты', cust: 180000, sub: 140000, paidOut: 0, paidIn: 0, kg: 15000, body: 'Рефрижератор', places: 20 },
        {
            n: 'ЗК-2606', from: 'Алматы', to: 'Караганда', cargo: 'Мебель',
            cust: 260000, sub: 205000, paidOut: 0, paidIn: 0, status: 'IN_TRANSIT',
            kg: 8000, body: 'Тент', places: 18,
        },
        // Два рейса с контрагентами из справочника — на них видно оба
        // состояния расчётов: у «Алтын Жол» условия заполнены, и рейс проходит
        // проверку сам; у «Береке» их нет, и рейс ждёт бухгалтера.
        {
            n: 'ЗК-2607', from: 'Алматы', to: 'Актобе', cargo: 'Бумага',
            cust: 430000, sub: 350000, paidOut: 0, paidIn: 0, status: 'IN_TRANSIT',
            kg: 16000, body: 'Тент', places: 24, carrierId: 'p3-cp-altyn',
        },
        {
            n: 'ЗК-2608', from: 'Астана', to: 'Павлодар', cargo: 'Оборудование',
            cust: 295000, sub: 240000, paidOut: 0, paidIn: 0, status: 'ASSIGNED',
            kg: 9000, body: 'Тент', places: 8, carrierId: 'p3-cp-bereke',
        },
    ];

    for (const s of specs) {
        const existing = await prisma.order.findFirst({ where: { orderNumber: s.n } });
        if (existing) await prisma.order.delete({ where: { id: existing.id } });

        const done = (s.status || 'COMPLETED') === 'COMPLETED';

        // Сроки погрузки и выгрузки. Без них карточка рейса показывала
        // «дата не указана» на обеих точках, и стенд выглядел так, будто
        // платформа сроки не ведёт. Завершённым ставим прошедшие даты, рейсу
        // в пути — вчера погрузился, завтра выгружается, чтобы он оставался
        // «в работе» в любой день, когда стенд поднимут заново.
        const day = 24 * 3600 * 1000;
        const pickupAt = done ? new Date('2026-07-13T09:00:00Z') : new Date(Date.now() - day);
        const deliveryAt = done ? new Date('2026-07-15T14:00:00Z') : new Date(Date.now() + day);

        const order = await prisma.order.create({
            data: {
                orderNumber: s.n,
                status: s.status || 'COMPLETED',
                cargoDescription: s.cargo,
                // Вес, кузов и число мест — то, без чего заявку не берут в
                // работу. Стенд, где заполнено одно название груза, показывал
                // пустую карточку и врал про платформу.
                cargoWeight: s.kg,
                cargoType: s.body,
                placesCount: s.places,
                customerCompanyId: client.id,
                customerId: clientUser.id,
                forwarderId: us.id,
                subForwarderId: s.carrierId || carrier.id,
                driverId: driver.id,
                assignedDriverName: 'Иванов Иван',
                assignedDriverPlate: '123 ABC 01',
                customerPrice: D(s.cust),
                subForwarderPrice: D(s.sub),
                // Даты закрытия ставим только завершённому: у рейса в пути
                // их нет, а отчёты считают по ним выручку и сроки оплаты.
                completedAt: done ? new Date('2026-07-15') : null,
                driverPaymentDate: done ? new Date('2026-07-25') : null,
                customerPaymentDate: done ? new Date('2026-08-05') : null,
                isSubForwarderPaid: s.paidOut >= s.sub,
                // Условия расчётов: у рейсов с карточкой справочника они
                // подставлены и проверка пройдена, у остальных — ждут
                // бухгалтера. Ровно так их проставляет платформа при
                // заведении заявки (`OrderSettlementsService`).
                ...(s.carrierId === 'p3-cp-altyn'
                    ? {
                        hasVat: true, vatRate: D(16),
                        executorHasVat: true, executorVatRate: D(16),
                        customerPaymentDays: 30, customerPaymentFrom: 'UNLOAD',
                        carrierPaymentDays: 15, carrierPaymentFrom: 'ORIGINALS',
                        settlementsConfirmedAt: new Date(),
                    }
                    : s.carrierId === 'p3-cp-bereke'
                        ? { settlementsConfirmedAt: null }
                        : { settlementsConfirmedAt: new Date() }),
                routePoints: {
                    create: [
                        {
                            sequence: 1, pointType: 'PICKUP', expectedDate: pickupAt,
                            location: { create: { name: `Склад ${s.from}`, city: s.from, address: `г. ${s.from}`, latitude: 43.2, longitude: 76.9, createdById: admin.id } },
                        },
                        {
                            sequence: 2, pointType: 'DELIVERY', expectedDate: deliveryAt,
                            location: { create: { name: `Склад ${s.to}`, city: s.to, address: `г. ${s.to}`, latitude: 51.1, longitude: 71.4, createdById: admin.id } },
                        },
                    ],
                },
            },
        });

        const payment = (direction, amount) => prisma.payment.create({
            data: {
                companyId: us.id, orderId: order.id, direction, amount: D(amount),
                method: 'BANK', date: new Date('2026-07-20'), createdById: admin.id,
            },
        });
        if (s.paidOut > 0) await payment('OUT', s.paidOut);
        if (s.paidIn > 0) await payment('IN', s.paidIn);
    }

    const link = (counterpartyId, ourRole) => prisma.sharedReportLink.create({
        data: {
            companyId: us.id,
            counterpartyId,
            ourRole,
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
            createdById: admin.id,
        },
        select: { token: true },
    });

    const carrierLink = await link(carrier.id, 'Экспедитор');
    const clientLink = await link(client.id, 'Экспедитор');

    console.log('вход:        admin@p3.kz / Test12345!   (руководитель, видит бухгалтерию)');
    console.log('менеджер:    manager@p3.kz / Test12345!  (без права «Бухгалтерия»)');
    console.log('перевозчик:  ' + carrierLink.token + '   (выставляет нам счёт)');
    console.log('заказчик:    ' + clientLink.token + '   (присылает нам чек)');
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
