import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PowerOfAttorneyService } from './power-of-attorney.service';

/**
 * Водитель из общей базы — на рейс любого своего перевозчика.
 *
 * Жалоба клиента: водитель сегодня едет от одного ИП, завтра от другого. В
 * заявке он был виден только у «своего» ИП, а назначить его на рейс другого
 * сервер не давал. Приходилось заводить того же человека ещё раз.
 *
 * Вместе с этим машина рейса стала жить в заявке: у каждого ИП своя машина,
 * и доверенность обязана показать ту, на которой едут в этом рейсе, а не
 * последнюю из карточки водителя.
 */

const МЫ = 'наша-компания';
const ИП_А = 'ип-а';
const ИП_Б = 'ип-б';
const ЧУЖИЕ = 'чужая-компания';

const БАЗА = [
    { id: МЫ, name: 'ТОО «ЛогиКор»' },
    { id: ИП_А, name: 'ИП Сериков' },
    { id: ИП_Б, name: 'ИП Алтын Жол' },
];

const ВОДИТЕЛИ: Record<string, any> = {
    'водитель-а': {
        id: 'водитель-а', role: 'DRIVER', companyId: ИП_А,
        lastName: 'Иванов', firstName: 'Иван', middleName: null, phone: '+77001112233',
        vehiclePlate: '123 AAA 02', trailerNumber: '45 AA 02',
    },
    'водитель-б': {
        id: 'водитель-б', role: 'DRIVER', companyId: ИП_Б,
        lastName: 'Петров', firstName: 'Пётр', middleName: null, phone: '+77005556677',
        vehiclePlate: '777 BBB 02', trailerNumber: null,
    },
    'чужой': {
        id: 'чужой', role: 'DRIVER', companyId: ЧУЖИЕ,
        lastName: 'Сидоров', firstName: 'Сидор', middleName: null, phone: '+77009998877',
        vehiclePlate: '999 CCC 02', trailerNumber: null,
    },
    'штатный': {
        id: 'штатный', role: 'DRIVER', companyId: МЫ,
        lastName: 'Ахметов', firstName: 'Ержан', middleName: null, phone: '+77004443322',
        vehiclePlate: '100 LOG 02', trailerNumber: null,
    },
};

const рейс = (сверху: any = {}) => ({
    id: 'рейс-1',
    orderNumber: 'ЗК-2701',
    status: OrderStatus.PENDING,
    driverId: null,
    customerCompanyId: 'заказчик',
    forwarderId: МЫ,
    partnerId: null,
    subForwarderId: null,
    customerId: 'менеджер',
    responsibleManagerId: 'менеджер',
    responsibleManager: { companyId: МЫ },
    ...сверху,
});

function сервис(заявка: any) {
    const prisma: any = {
        user: { findUnique: jest.fn(async ({ where }: any) => ВОДИТЕЛИ[where.id] ?? null) },
        company: {
            findMany: jest.fn().mockResolvedValue(БАЗА),
            findUnique: jest.fn().mockResolvedValue({ isExternal: false }),
        },
        order: {
            update: jest.fn(async ({ data }: any) => ({ ...заявка, ...data })),
        },
    };
    const service = new OrdersService(
        prisma,
        {} as any,
        { syncOrderPaymentFlags: jest.fn() } as any,
        { checkPeriodNotClosed: jest.fn() } as any,
        {} as any,
        {} as any,
        {} as any,
        { applyFromCards: jest.fn(), recomputeDueDates: jest.fn() } as any,
    );
    jest.spyOn(service, 'findById').mockResolvedValue(заявка);
    return { service, prisma, записано: () => prisma.order.update.mock.calls.at(-1)?.[0]?.data };
}

describe('Назначить водителя из общей базы', () => {
    it('водитель ИП «А» — на рейс ИП «Б»', async () => {
        const { service, записано } = сервис(рейс());

        await service.assignDriver('рейс-1', 'водитель-а', ИП_Б, {}, { requesterCompanyId: МЫ });

        expect(записано()).toMatchObject({ driverId: 'водитель-а', partnerId: ИП_Б, status: OrderStatus.ASSIGNED });
    });

    it('машина рейса — та, что ввели при назначении, а не из карточки', async () => {
        const { service, записано } = сервис(рейс());

        await service.assignDriver('рейс-1', 'водитель-а', ИП_Б, {}, {
            requesterCompanyId: МЫ,
            trip: { plate: '555 БББ 02', trailer: '' },
        });

        expect(записано().assignedDriverPlate).toBe('555 БББ 02');
        // Пустая строка — «в этом рейсе без прицепа», а не прицеп из карточки.
        expect(записано().assignedDriverTrailer).toBeNull();
    });

    it('машину не ввели — берём из карточки, как было', async () => {
        const { service, записано } = сервис(рейс());

        await service.assignDriver('рейс-1', 'водитель-а', ИП_Б, {}, { requesterCompanyId: МЫ });

        expect(записано().assignedDriverPlate).toBe('123 AAA 02');
        expect(записано().assignedDriverTrailer).toBe('45 AA 02');
    });

    it('чужого водителя поставить нельзя', async () => {
        const { service, prisma } = сервис(рейс());

        await expect(service.assignDriver('рейс-1', 'чужой', ИП_Б, {}, { requesterCompanyId: МЫ }))
            .rejects.toThrow('не из вашей базы');
        expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('в чужой рейс назначать нельзя вовсе', async () => {
        // Раньше сюда пускали по одному id заявки: логист любой компании мог
        // переписать водителя и перевозчика в чужом рейсе.
        const { service, prisma } = сервис(рейс({
            customerCompanyId: 'кто-то', forwarderId: ЧУЖИЕ, responsibleManager: { companyId: ЧУЖИЕ },
        }));

        await expect(service.assignDriver('рейс-1', 'водитель-а', ИП_Б, {}, { requesterCompanyId: МЫ }))
            .rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('у администратора платформы — прежнее правило', async () => {
        const { service } = сервис(рейс());

        await expect(service.assignDriver('рейс-1', 'водитель-а', ИП_Б, {}))
            .rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('Рейс, который нам передали на платформе', () => {
    // Экспедитор на платформе выбрал нашу компанию перевозчиком: мы в заявке
    // субэкспедитор, экспедитор — он. Раньше проверка сверяла водителя с
    // экспедитором, и своего же водителя на такой рейс мы поставить не могли.
    const переданный = (сверху: any = {}) => рейс({
        customerCompanyId: 'заказчик', forwarderId: ЧУЖИЕ, subForwarderId: МЫ,
        responsibleManager: { companyId: ЧУЖИЕ }, ...сверху,
    });

    it('ставим своего штатного водителя', async () => {
        const { service, записано } = сервис(переданный());

        await service.assignDriver('рейс-1', 'штатный', undefined, {}, { requesterCompanyId: МЫ });

        expect(записано()).toMatchObject({ driverId: 'штатный', partnerId: null, forwarderId: ЧУЖИЕ });
    });

    it('ставим водителя из своей базы — прописанного у нашего ИП', async () => {
        const { service, записано } = сервис(переданный());

        await service.assignDriver('рейс-1', 'водитель-а', undefined, {}, { requesterCompanyId: МЫ });

        expect(записано().driverId).toBe('водитель-а');
    });

    it('партнёром рейса — так же, и партнёром остаёмся', async () => {
        const { service, записано } = сервис(переданный({ subForwarderId: null, partnerId: МЫ }));

        await service.assignDriver('рейс-1', 'штатный', МЫ, {}, { requesterCompanyId: МЫ });

        expect(записано()).toMatchObject({ driverId: 'штатный', partnerId: МЫ });
    });

    it('заказчик своего водителя на рейс экспедитора не ставит — как было', async () => {
        // Рейс везёт экспедитор на платформе, мы в заявке только заказчик:
        // водителя назначает он, а не мы.
        const { service, prisma } = сервис(рейс({
            customerCompanyId: МЫ, forwarderId: ЧУЖИЕ, responsibleManager: { companyId: ЧУЖИЕ },
        }));

        await expect(service.assignDriver('рейс-1', 'штатный', undefined, {}, { requesterCompanyId: МЫ }))
            .rejects.toThrow('не из вашей базы');
        expect(prisma.order.update).not.toHaveBeenCalled();
    });
});

describe('Правка рейса со сменой водителя', () => {
    const правщик = { id: 'менеджер', role: 'LOGISTICIAN', companyId: МЫ };

    it('сменили водителя — ФИО и машина в заявке пишутся заново', async () => {
        // Раньше менялся только сам водитель, а снимок оставался от
        // прежнего: договор-заявка показывал чужую машину.
        const { service, записано } = сервис(рейс({ status: OrderStatus.ASSIGNED, driverId: 'водитель-а' }));

        await service.update('рейс-1', { driverId: 'водитель-б' }, правщик);

        expect(записано()).toMatchObject({
            driverId: 'водитель-б',
            assignedDriverName: 'Петров Пётр',
            assignedDriverPlate: '777 BBB 02',
        });
    });

    it('водитель тот же, машину рейса поправили в форме', async () => {
        const { service, prisma, записано } = сервис(рейс({ status: OrderStatus.ASSIGNED, driverId: 'водитель-а' }));

        await service.update('рейс-1', { driverId: 'водитель-а', tripPlate: '321 ZZZ 02' }, правщик);

        expect(записано().assignedDriverPlate).toBe('321 ZZZ 02');
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('правка без водителя и машины снимок не трогает', async () => {
        // Иначе правка цены в старом рейсе подтягивала бы в него машину,
        // на которой водитель ездит сегодня.
        const { service, записано } = сервис(рейс({ status: OrderStatus.COMPLETED, driverId: 'водитель-а' }));

        await service.update('рейс-1', { cargoDescription: 'кирпич' }, правщик);

        expect(записано().assignedDriverPlate).toBeUndefined();
        expect(записано().assignedDriverName).toBeUndefined();
    });

    it('чужого водителя при правке не поставить', async () => {
        const { service } = сервис(рейс({ status: OrderStatus.ASSIGNED, driverId: 'водитель-а' }));

        await expect(service.update('рейс-1', { driverId: 'чужой' }, правщик))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('служебные поля машины рейса в заявку как есть не пишутся', async () => {
        const { service, записано } = сервис(рейс({ status: OrderStatus.ASSIGNED, driverId: 'водитель-а' }));

        await service.update('рейс-1', { driverId: 'водитель-а', tripPlate: '1', tripTrailer: '2' }, правщик);

        expect(записано().tripPlate).toBeUndefined();
        expect(записано().tripTrailer).toBeUndefined();
    });
});

describe('Заведение заявки с водителем', () => {
    it('чужого водителя вписать нельзя — раньше при заведении не проверялось ничего', async () => {
        const { service, prisma } = сервис(рейс());
        jest.spyOn(service as any, 'generateOrderNumber').mockResolvedValue('ЗК-1');
        prisma.user.findUnique.mockImplementation(async ({ where }: any) =>
            ВОДИТЕЛИ[where.id] ?? { id: where.id, companyId: МЫ });

        await expect(service.create({
            customerId: 'менеджер',
            customerCompanyId: МЫ,
            forwarderId: ИП_Б,
            ownerCompanyId: МЫ,
            driverId: 'чужой',
            routePoints: [],
        })).rejects.toThrow('не из вашей базы');
    });
});

describe('Машина в доверенности', () => {
    const заявка = (сверху: any = {}) => ({
        id: 'рейс-1',
        orderNumber: 'ЗК-2701',
        createdAt: new Date('2026-09-23'),
        cargoDescription: 'кирпич',
        cargoWeight: 20000,
        customerCompanyId: 'заказчик',
        forwarderId: МЫ,
        subForwarderId: null,
        assignedDriverName: 'Иванов Иван',
        assignedDriverPlate: '555 BBB 02',
        assignedDriverTrailer: null,
        driver: { ...ВОДИТЕЛИ['водитель-а'], vehicleModel: 'Volvo', docNumber: '0123', docType: 'ID_CARD' },
        customer: null,
        customerCompany: { id: 'заказчик', name: 'ТОО «Заказчик»' },
        partner: null,
        subForwarder: null,
        forwarder: { id: МЫ, name: 'ТОО «ЛогиКор»' },
        routePoints: [],
        ...сверху,
    });

    const снимок = async (order: any) => {
        const prisma: any = {
            order: { findUnique: jest.fn().mockResolvedValue(order) },
            company: { findUnique: jest.fn().mockResolvedValue(null) },
        };
        const poa = new PowerOfAttorneyService(prisma, { loadFor: jest.fn() } as any);
        return poa.snapshotFor('рейс-1', МЫ);
    };

    it('номер тягача — из заявки, а не последний из карточки водителя', async () => {
        const итог = await снимок(заявка());

        expect(итог.driverPlate).toBe('555 BBB 02');
        expect(итог.vehicleInfo).not.toContain('123 AAA 02');
    });

    it('в рейсе без прицепа прицеп из карточки не подставляется', async () => {
        const итог = await снимок(заявка());

        expect(итог.vehicleInfo).not.toContain('45 AA 02');
    });

    it('у старого рейса без снимка машины — как раньше, из карточки', async () => {
        const итог = await снимок(заявка({ assignedDriverPlate: null }));

        expect(итог.driverPlate).toBe('123 AAA 02');
        expect(итог.vehicleInfo).toContain('45 AA 02');
    });
});
