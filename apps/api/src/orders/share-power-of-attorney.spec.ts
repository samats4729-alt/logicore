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
    /** Тело письма собирает сервис доверенности — см. `poa-email-data.spec.ts`. */
    const ПИСЬМО = {
        orderNumber: 'ЗК-2601', senderCompany: 'ТОО «Экспедитор»',
        driver: { name: 'Садыков Марат', phone: '+77051234567' }, vehicle: 'Volvo FH · 888 FRE 02', trailer: '45ПП02',
    };

    const собрать = (заявка: any = {}) => {
        const poaService: any = {
            generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
            emailData: jest.fn().mockResolvedValue(ПИСЬМО),
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
                ...заявка,
            }),
        };
        const prisma: any = {
            company: { findUnique: jest.fn().mockResolvedValue({ name: 'ТОО «Экспедитор»' }) },
            document: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const auditService: any = { log: jest.fn().mockResolvedValue(undefined) };
        const s3: any = { isS3Enabled: () => false };
        const orderDocuments: any = {
            lastPowerOfAttorneyRecipients: jest.fn().mockResolvedValue({ at: null, emails: [] }),
        };

        const controller = new OrdersController(
            ordersService,
            poaService,
            {} as any,
            orderDocuments,
            {} as any,
            emailService,
            prisma,
            {} as any,
            {} as any,
            auditService,
            {} as any,
            s3,
            {} as any,
        );

        return { controller, poaService, emailService, auditService, prisma, ordersService, orderDocuments };
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
            // Третьим аргументом уходит PDF — он один на всех получателей.
            expect(вызов[2]).toEqual(Buffer.from('pdf'));
        }
    });

    it('без адресов ничего не печатает и не шлёт', async () => {
        const { controller, poaService, emailService, auditService } = собрать();

        await expect(
            controller.sharePowerOfAttorney('order-1', { emails: [] }, запрос),
        ).rejects.toThrow();

        expect(poaService.generatePdf).not.toHaveBeenCalled();
        expect(emailService.sendPowerOfAttorneyEmail).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
    });

    it('тело письма — данные доверенности: маршрут, машина, водитель (31.10.2026)', async () => {
        const { controller, poaService, emailService } = собрать();

        await controller.sharePowerOfAttorney('order-1', { emails: ['skl@example.kz'] }, запрос);

        expect(poaService.emailData).toHaveBeenCalledWith('order-1', КОМПАНИЯ, { senderUserId: 'user-1', extraFiles: [] });
        expect(emailService.sendPowerOfAttorneyEmail.mock.calls[0][1]).toBe(ПИСЬМО);
    });

    it('отправка остаётся в истории рейса: кому и на какого водителя', async () => {
        const { controller, auditService } = собрать();

        await controller.sharePowerOfAttorney(
            'order-1',
            { emails: ['skl@example.kz', 'buh@example.kz', 'SKL@example.kz'] },
            запрос,
        );

        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
            orderId: 'order-1',
            entity: 'power_of_attorney_sent',
            entityLabel: 'Доверенность по заявке № ЗК-2601 отправлена · водитель Садыков Марат → skl@example.kz, buh@example.kz',
            // По этим адресам новую доверенность после замены водителя
            // предложат отправить туда же.
            details: expect.objectContaining({ kind: 'POWER_OF_ATTORNEY_SHARE', emails: ['skl@example.kz', 'buh@example.kz'], driver: 'Садыков Марат' }),
        }));
    });

    it('кому ушла прежняя — только тому, кому рейс виден', async () => {
        const { controller, ordersService, orderDocuments } = собрать();

        await controller.powerOfAttorneyRecipients('order-1', запрос);

        expect(ordersService.findById).toHaveBeenCalledWith('order-1', {
            userId: 'user-1', role: 'COMPANY_ADMIN', companyId: КОМПАНИЯ,
        });
        expect(orderDocuments.lastPowerOfAttorneyRecipients).toHaveBeenCalledWith('order-1', КОМПАНИЯ);
    });

    it('чужой рейс — адресов не отдаём', async () => {
        const { controller, ordersService, orderDocuments } = собрать();
        ordersService.findById.mockRejectedValueOnce(new Error('У вас нет доступа к этой заявке'));

        await expect(controller.powerOfAttorneyRecipients('order-1', запрос)).rejects.toThrow('нет доступа');
        expect(orderDocuments.lastPowerOfAttorneyRecipients).not.toHaveBeenCalled();
    });

    it('письмо не ушло — в истории не пишем, что отправлено', async () => {
        const { controller, emailService, auditService } = собрать();
        emailService.sendPowerOfAttorneyEmail.mockRejectedValueOnce(new Error('SMTP недоступен'));

        await expect(
            controller.sharePowerOfAttorney('order-1', { emails: ['skl@example.kz'] }, запрос),
        ).rejects.toThrow('SMTP недоступен');

        expect(auditService.log).not.toHaveBeenCalled();
    });
    it('в журнале — водитель, тягач и прицеп из письма (D4)', async () => {
        const { controller, auditService } = собрать();
        await controller.sharePowerOfAttorney('order-1', { emails: ['skl@example.kz'] }, запрос);
        expect(auditService.log.mock.calls[0][0]).toMatchObject({
            entity: 'power_of_attorney_sent', orderId: 'order-1',
            details: { emails: ['skl@example.kz'], driver: 'Садыков Марат', vehicle: 'Volvo FH · 888 FRE 02 / 45ПП02' },
        });
    });

    it('с формы с файлами адреса приходят строкой, файлы — вложениями (D3)', async () => {
        const { controller, emailService } = собрать();
        const file: any = { originalname: 'udostoverenie.pdf', mimetype: 'application/pdf', size: 10, buffer: Buffer.from('%PDF-1.4') };
        await controller.sharePowerOfAttorney('order-1', { emails: '["a@x.kz","b@x.kz"]' } as any, запрос, [file]);
        expect(emailService.sendPowerOfAttorneyEmail).toHaveBeenCalledTimes(2);
        expect(emailService.sendPowerOfAttorneyEmail.mock.calls[0][3]).toEqual([{ filename: 'udostoverenie.pdf', content: file.buffer }]);
    });
});
