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
        };

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
            {} as any,
        );

        return { controller, poaService, emailService };
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
});
