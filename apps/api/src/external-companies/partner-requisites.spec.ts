import { ExternalCompaniesService } from './external-companies.service';
import { companyRequisitesText } from '../contracts/contract-template';

/**
 * Реквизиты контрагента: их можно записать, и они доходят до договора.
 *
 * До этого банковских полей не было ни в одном окне правки — ни из списка,
 * ни из карточки. Договор при этом печатает блок реквизитов обеих сторон, и
 * строки «р/счёт», «Банк», «БИК/SWIFT», «КБЕ» уходили пустыми. Подтянуться
 * сами они не могут: по БИН из госреестра приходят название, адрес,
 * директор и контакты, банковских счетов там нет.
 */

const МОЯ = 'our-co';
const КОНТРАГЕНТ = 'partner-co';

function служба(карточка: Record<string, any> = {}) {
    const запись = {
        id: КОНТРАГЕНТ,
        isExternal: true,
        createdByCompanyId: МОЯ,
        bin: '123456789012',
        ...карточка,
    };
    const prisma: any = {
        company: {
            findUnique: jest.fn(async () => запись),
            findFirst: jest.fn(async () => null),
            update: jest.fn(async ({ data }: any) => ({ ...запись, ...data })),
            create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
        },
        user: { findFirst: jest.fn(async () => ({ id: 'manager' })) },
    };
    return { service: new ExternalCompaniesService(prisma), prisma };
}

describe('Реквизиты контрагента', () => {
    const реквизиты = {
        actualAddress: 'г. Алматы, ул. Толе би 50',
        bankAccount: 'KZ123456789012345678',
        bankName: 'АО «Банк ЦентрКредит»',
        bankBic: 'KCJBKZKX',
        kbe: '17',
        paymentPurposeCode: '710',
        signatoryName: 'Петров Пётр Петрович',
        signatoryPosition: 'Коммерческий директор',
    };

    it('банковские реквизиты и подписант сохраняются', async () => {
        const { service, prisma } = служба();
        await service.updateExternalCompany(МОЯ, КОНТРАГЕНТ, реквизиты);

        expect(prisma.company.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining(реквизиты) }),
        );
    });

    it('чужие колонки в запрос не попадают, даже если их прислали', async () => {
        // Тело запроса уходило в базу целиком: глобальная проверка срезает
        // лишнее только у описанных классов, а тип здесь объявлен на месте.
        // То есть вместе с названием можно было прислать `isExternal` или
        // `createdByCompanyId` — и забрать карточку себе.
        const { service, prisma } = служба();
        await service.updateExternalCompany(МОЯ, КОНТРАГЕНТ, {
            name: 'ТОО «Новое имя»',
            isExternal: false,
            createdByCompanyId: 'чужая-компания',
            verificationStatus: 'VERIFIED',
        } as any);

        const { data } = prisma.company.update.mock.calls[0][0];
        expect(data).toEqual({ name: 'ТОО «Новое имя»' });
    });

    it('при заведении контрагента реквизиты тоже записываются', async () => {
        const { service, prisma } = служба();
        await service.createExternalCompany(МОЯ, {
            name: 'ТОО «Пример»', type: 'CUSTOMER', bin: '210987654321', ...реквизиты,
        });

        const { data } = prisma.company.create.mock.calls[0][0];
        expect(data).toEqual(expect.objectContaining(реквизиты));
    });

    it('пустое поле не затирает записанное', async () => {
        // Окно открывается с полями, которых может не быть в строке списка.
        // Несказанное должно остаться как есть, а не обнулиться.
        const { service, prisma } = служба();
        await service.updateExternalCompany(МОЯ, КОНТРАГЕНТ, { name: 'ТОО «Пример»' });

        const { data } = prisma.company.update.mock.calls[0][0];
        expect(data).not.toHaveProperty('bankAccount');
    });

    it('записанные реквизиты печатаются в договоре', async () => {
        // Тем же текстом заполняется колонка в редакторе договора и
        // печатается таблица в PDF.
        const текст = companyRequisitesText({
            name: 'ТОО «Пример»',
            address: 'г. Алматы, ул. Абая 1',
            bin: '210987654321',
            ...реквизиты,
        });

        expect(текст).toContain('р/счёт: KZ123456789012345678');
        expect(текст).toContain('Банк: АО «Банк ЦентрКредит»');
        expect(текст).toContain('БИК/SWIFT: KCJBKZKX');
        expect(текст).toContain('КБЕ: 17');
        expect(текст).toContain('Факт. адрес: г. Алматы, ул. Толе би 50');
    });
});
