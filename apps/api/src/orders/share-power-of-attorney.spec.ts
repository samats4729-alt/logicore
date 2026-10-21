import { OrdersController } from './orders.controller';

/**
 * Доверенность, отправленная по почте, должна быть заверена.
 *
 * Скачанная доверенность печать получала, а отправленная письмом — нет:
 * в рассылку флажок просто не передавали. На погрузке по чистому бланку
 * машину не пускают, и узнаёт об этом человек уже от водителя, стоящего
 * на воротах.
 *
 * Проверяем на уровне вызова: с каким флажком просят PDF, тем он и
 * получится — что печать рисуется только своей стороне, закреплено
 * отдельно в `power-of-attorney.service.spec.ts`.
 */

describe('рассылка доверенности по почте', () => {
    const КОМПАНИЯ = 'company-1';

    const собрать = () => {
        const poaService: any = {
            generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
        };
        const emailService: any = {
            sendPowerOfAttorneyEmail: jest.fn().mockResolvedValue(undefined),
        };
        const ordersService: any = {
            findById: jest.fn().mockResolvedValue({
                id: 'order-1',
                orderNumber: 'ЗК-2601',
                driver: null,
                routePoints: [],
            }),
        };
        const prisma: any = {
            company: { findUnique: jest.fn().mockResolvedValue({ name: 'ТОО «Экспедитор»' }) },
            document: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const auditService: any = { log: jest.fn() };
        const s3: any = { isS3Enabled: () => false };

        const controller = new OrdersController(
            ordersService,
            poaService,
            {} as any,
            {} as any,
            {} as any,
            emailService,
            prisma,
            {} as any,
            {} as any,
            auditService,
            {} as any,
            s3,
        );

        return { controller, poaService, emailService, auditService, prisma };
    };

    const запрос = { user: { sub: 'user-1', role: 'COMPANY_ADMIN', companyId: КОМПАНИЯ } };

    it('PDF для письма просят с печатью', async () => {
        const { controller, poaService } = собрать();

        await controller.sharePowerOfAttorney('order-1', { emails: ['skl@example.kz'] }, запрос);

        expect(poaService.generatePdf).toHaveBeenCalledWith('order-1', КОМПАНИЯ, { withStamp: true });
    });

    it('во вложении письма — тот самый заверенный файл', async () => {
        const { controller, emailService } = собрать();

        await controller.sharePowerOfAttorney(
            'order-1',
            { emails: ['skl@example.kz', 'buh@example.kz'] },
            запрос,
        );

        expect(emailService.sendPowerOfAttorneyEmail).toHaveBeenCalledTimes(2);
        for (const вызов of emailService.sendPowerOfAttorneyEmail.mock.calls) {
            // Четвёртым аргументом уходит PDF — он один на всех получателей.
            expect(вызов[3]).toEqual(Buffer.from('pdf'));
        }
    });

    it('без адресов ничего не печатает и не шлёт', async () => {
        const { controller, poaService, emailService } = собрать();

        await expect(
            controller.sharePowerOfAttorney('order-1', { emails: [] }, запрос),
        ).rejects.toThrow();

        expect(poaService.generatePdf).not.toHaveBeenCalled();
        expect(emailService.sendPowerOfAttorneyEmail).not.toHaveBeenCalled();
    });
    it('в письме — документ водителя, тягач и прицеп отдельно (D5); отправка — в журнал (D4)', async () => {
        const { controller, emailService, auditService } = собрать();
        (controller as any).ordersService.findById.mockResolvedValue({
            id: 'order-1', orderNumber: 'ЗК-2601', routePoints: [], assignedDriverPlate: '123ABC02', assignedDriverTrailer: '45ПП02',
            driver: { lastName: 'Иванов', firstName: 'Иван', middleName: null, phone: '+77010000000', vehicleModel: 'Volvo FH',
                docType: 'ID_CARD', docNumber: '049123456', docIssuedAt: new Date('2019-03-12T00:00:00Z'), docIssuedBy: 'МВД РК', docExpiresAt: new Date('2029-03-12T00:00:00Z') },
        });
        await controller.sharePowerOfAttorney('order-1', { emails: ['skl@example.kz'] }, запрос);
        const info = emailService.sendPowerOfAttorneyEmail.mock.calls[0][4];
        expect(info).toMatchObject({ vehiclePlate: '123ABC02', trailer: '45ПП02', vehicleModel: 'Volvo FH' });
        expect(info.document).toBe('Удостоверение личности № 049123456, выдано 12.03.2019 МВД РК, действительно до 12.03.2029');
        expect(auditService.log.mock.calls[0][0]).toMatchObject({ entity: 'power_of_attorney_sent', orderId: 'order-1', details: { emails: ['skl@example.kz'] } });
    });

    it('с формы с файлами адреса приходят строкой, файлы — вложениями (D3)', async () => {
        const { controller, emailService } = собрать();
        const file: any = { originalname: 'udostoverenie.pdf', mimetype: 'application/pdf', size: 10, buffer: Buffer.from('%PDF-1.4') };
        await controller.sharePowerOfAttorney('order-1', { emails: '["a@x.kz","b@x.kz"]' } as any, запрос, [file]);
        expect(emailService.sendPowerOfAttorneyEmail).toHaveBeenCalledTimes(2);
        expect(emailService.sendPowerOfAttorneyEmail.mock.calls[0][5]).toEqual([{ filename: 'udostoverenie.pdf', content: file.buffer }]);
    });
});
