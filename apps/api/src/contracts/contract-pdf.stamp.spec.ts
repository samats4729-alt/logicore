import { ContractPdfService } from './contract-pdf.service';

/**
 * T-04(б): печать и подпись КОНТРАГЕНТА не должны попадать в договор
 * никогда. Поставить их без его действия — значит изобразить, что вторая
 * сторона документ подписала; механизма подтверждения от контрагента у
 * системы нет.
 *
 * Проверяем на уровне загрузки изображений: чего не прочитали из хранилища,
 * то физически не может оказаться в PDF.
 */
describe('ContractPdfService — печати сторон', () => {
    const FORWARDER = 'company-forwarder';
    const CUSTOMER = 'company-customer';

    const makeService = () => {
        const contract = {
            id: 'contract-1',
            contractNumber: '17/01',
            startDate: new Date('2026-01-17'),
            endDate: null,
            // null — берётся шаблон по умолчанию, корректный по структуре.
            content: null,
            customerCompany: {
                id: CUSTOMER,
                name: 'ТОО «Заказчик»',
                stampImage: 'uploads/customer-stamp.png',
                signatureImage: 'uploads/customer-sign.png',
            },
            forwarderCompany: {
                id: FORWARDER,
                name: 'ТОО «Экспедитор»',
                stampImage: 'uploads/forwarder-stamp.png',
                signatureImage: 'uploads/forwarder-sign.png',
            },
            agreements: [],
        };
        const prisma: any = { contract: { findUnique: jest.fn().mockResolvedValue(contract) } };
        const s3: any = { isS3Enabled: jest.fn().mockReturnValue(false) };
        const service = new ContractPdfService(prisma, s3);

        // Подменяем чтение файла: важно не содержимое картинки, а сам факт
        // обращения к печати той или иной стороны.
        const requested: string[] = [];
        (service as any).getImageBuffer = jest.fn(async (relativePath: string) => {
            requested.push(relativePath);
            return null;
        });
        return { service, requested };
    };

    it('без флажка не загружает ничьих печатей', async () => {
        const { service, requested } = makeService();

        await service.generateContractPdf('contract-1', { requestingCompanyId: FORWARDER });

        expect(requested).toEqual([]);
    });

    it('с флажком берёт печать только своей стороны', async () => {
        const { service, requested } = makeService();

        await service.generateContractPdf('contract-1', {
            requestingCompanyId: FORWARDER,
            withStamp: true,
        });

        expect(requested).toEqual(['uploads/forwarder-stamp.png', 'uploads/forwarder-sign.png']);
        expect(requested.some((path) => path.includes('customer'))).toBe(false);
    });

    it('печатает заказчик — его печать своя, а экспедитора не берётся', async () => {
        const { service, requested } = makeService();

        await service.generateContractPdf('contract-1', {
            requestingCompanyId: CUSTOMER,
            withStamp: true,
        });

        expect(requested).toEqual(['uploads/customer-stamp.png', 'uploads/customer-sign.png']);
        expect(requested.some((path) => path.includes('forwarder'))).toBe(false);
    });

    it('посторонней компании не даёт ничьей печати', async () => {
        const { service, requested } = makeService();

        await service.generateContractPdf('contract-1', {
            requestingCompanyId: 'company-outsider',
            withStamp: true,
        });

        expect(requested).toEqual([]);
    });
});
