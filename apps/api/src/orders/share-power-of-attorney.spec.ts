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

    const собрать = (заявка: any = {}) => {
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
                ...заявка,
            }),
        };
        const prisma: any = {
            company: { findUnique: jest.fn().mockResolvedValue({ name: 'ТОО «Экспедитор»' }) },
        };
        const auditService: any = { log: jest.fn().mockResolvedValue(undefined) };
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
        );

        return { controller, poaService, emailService, auditService, ordersService, orderDocuments };
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
        const { controller, poaService, emailService, auditService } = собрать();

        await expect(
            controller.sharePowerOfAttorney('order-1', { emails: [] }, запрос),
        ).rejects.toThrow();

        expect(poaService.generatePdf).not.toHaveBeenCalled();
        expect(emailService.sendPowerOfAttorneyEmail).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
    });

    it('в тексте письма — машина рейса, а не последняя из карточки водителя', async () => {
        // Водитель сегодня едет на другой машине: в доверенности она, и в
        // письме должна быть она же.
        const { controller, emailService } = собрать({
            driver: { lastName: 'Садыков', firstName: 'Марат', vehiclePlate: '111 OLD 02', phone: '+77050000000' },
            assignedDriverPlate: '888 FRE 02',
            assignedDriverPhone: '+77051234567',
        });

        await controller.sharePowerOfAttorney('order-1', { emails: ['skl@example.kz'] }, запрос);

        const водитель = emailService.sendPowerOfAttorneyEmail.mock.calls[0][4];
        expect(водитель.vehiclePlate).toBe('888 FRE 02');
        expect(водитель.phone).toBe('+77051234567');
    });

    it('у старого рейса без машины в заявке — номер из карточки, как раньше', async () => {
        const { controller, emailService } = собрать({
            driver: { lastName: 'Иванов', firstName: 'Иван', vehiclePlate: '777 AAA 02' },
        });

        await controller.sharePowerOfAttorney('order-1', { emails: ['skl@example.kz'] }, запрос);

        expect(emailService.sendPowerOfAttorneyEmail.mock.calls[0][4].vehiclePlate).toBe('777 AAA 02');
    });

    it('отправка остаётся в истории рейса: кому и на какого водителя', async () => {
        const { controller, auditService } = собрать({ assignedDriverName: 'Садыков Марат' });

        await controller.sharePowerOfAttorney(
            'order-1',
            { emails: ['skl@example.kz', 'buh@example.kz', 'SKL@example.kz'] },
            запрос,
        );

        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
            orderId: 'order-1',
            entity: 'order_document',
            entityLabel: 'Отправлена доверенность · водитель Садыков Марат → skl@example.kz, buh@example.kz',
            // По этим адресам новую доверенность после замены водителя
            // предложат отправить туда же.
            details: { kind: 'POWER_OF_ATTORNEY_SHARE', emails: ['skl@example.kz', 'buh@example.kz'] },
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
});
