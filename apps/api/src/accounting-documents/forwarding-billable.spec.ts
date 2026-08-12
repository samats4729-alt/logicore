import { AccountingDocumentDirection, Prisma } from '@prisma/client';
import { AccountingDocumentsService } from './accounting-documents.service';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';

/**
 * Подбор рейсов при экспедиторской схеме НДС.
 *
 * Чтобы разделить счёт клиенту на возмещение и вознаграждение, подбору нужна
 * стоимость перевозчика по рейсу. Здесь проверяется, что она отдаётся только
 * там, где имеет смысл, и что схема не включается сама по себе: компания без
 * настройки работает ровно как раньше.
 */
describe('Подбор рейсов и экспедиторский НДС', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);
    const COMPANY = 'c-1';
    const CUSTOMER = 'cust-1';
    const CARRIER = 'carr-1';

    const build = (options: { vatScheme?: string; orders?: any[] } = {}) => {
        const prisma: any = {
            company: {
                findUnique: jest.fn().mockResolvedValue({ vatScheme: options.vatScheme ?? 'STANDARD' }),
            },
            order: { findMany: jest.fn().mockResolvedValue(options.orders ?? []) },
        };
        const service = new AccountingDocumentsService(
            prisma,
            new AccountingDocumentCalculatorService(),
            { checkPeriodNotClosed: jest.fn() } as any,
            {} as any,
            { toBase: jest.fn().mockResolvedValue(null) } as any,
            { recomputeForDocument: jest.fn().mockResolvedValue(0) } as any,
        );
        return { service, prisma };
    };

    const order = (overrides: any = {}) => ({
        id: 'o-1',
        orderNumber: '000000229',
        status: 'COMPLETED',
        createdAt: new Date('2026-08-01'),
        cargoDescription: 'Груз',
        currency: 'KZT',
        customerPrice: D('670000'),
        driverCost: D('537348'),
        subForwarderPrice: null,
        subForwarderId: null,
        vatRate: D('16'),
        hasVat: true,
        executorVatRate: D('16'),
        executorHasVat: true,
        assignedDriverName: 'Амангельды Е.',
        assignedDriverPlate: '123ABC',
        routePoints: [],
        ...overrides,
    });

    const outgoing = {
        counterpartyId: CUSTOMER,
        direction: AccountingDocumentDirection.OUTGOING,
    } as any;

    it('при обычной схеме признак не поднимается', async () => {
        // Компания, которая ничего не настраивала, работает как раньше.
        const { service } = build({ orders: [order()] });
        const rows = await service.listBillableOrders(COMPANY, outgoing);

        expect(rows[0].forwardingVat).toBe(false);
    });

    it('при экспедиторской схеме признак поднят и видна ставка перевозчика', async () => {
        const { service } = build({ vatScheme: 'FORWARDING', orders: [order()] });
        const rows = await service.listBillableOrders(COMPANY, outgoing);

        expect(rows[0].forwardingVat).toBe(true);
        expect(Number(rows[0].carrierCost)).toBe(537348);
        expect(Number(rows[0].amount)).toBe(670000);
    });

    it('ставка суб-экспедитора идёт вместо ставки водителя', async () => {
        const { service } = build({
            vatScheme: 'FORWARDING',
            orders: [order({ subForwarderId: 'sub-1', subForwarderPrice: D('500000') })],
        });
        const rows = await service.listBillableOrders(COMPANY, outgoing);

        expect(Number(rows[0].carrierCost)).toBe(500000);
    });

    it('во входящем счёте делить нечего', async () => {
        // Счёт выставляет нам перевозчик: его вознаграждение — его дело.
        const { service } = build({ vatScheme: 'FORWARDING', orders: [order()] });
        const rows = await service.listBillableOrders(COMPANY, {
            counterpartyId: CARRIER,
            direction: AccountingDocumentDirection.INCOMING,
        } as any);

        expect(rows[0].forwardingVat).toBe(false);
        expect(Number(rows[0].carrierCost)).toBe(0);
    });

    it('схема берётся у своей компании, а не у контрагента', async () => {
        const { service, prisma } = build({ vatScheme: 'FORWARDING', orders: [order()] });
        await service.listBillableOrders(COMPANY, outgoing);

        expect(prisma.company.findUnique.mock.calls[0][0].where.id).toBe(COMPANY);
    });
});
