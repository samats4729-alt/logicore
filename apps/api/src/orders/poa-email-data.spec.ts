import { PowerOfAttorneyService, PowerOfAttorneySnapshot } from './power-of-attorney.service';
import { poaEmail } from '../email/poa-email';

/**
 * Тело письма с доверенностью (владелец, 31.10.2026: «доверенность
 * отправляется, но тело пустое — нужно: откуда куда, какая машина, водитель,
 * его контактные и паспортные данные»).
 */

const СНИМОК: PowerOfAttorneySnapshot = {
    orderNumber: 'ЗК-2601',
    issuedAt: '2026-10-30T05:00:00Z',
    validTo: '2026-11-05T05:00:00Z',
    driverName: 'Иванов Иван',
    driverShort: 'Иванов И.',
    driverDocType: 'Удостоверение личности',
    driverDocNumber: '049123456',
    driverDocIssuedBy: 'МВД РК',
    driverDocIssuedAt: '2019-03-12T00:00:00Z',
    vehicleInfo: 'Volvo FH 123ABC02 ПП 45ПП02',
    driverPlate: '123ABC02',
    supplierName: 'ТОО «Заказчик»',
    route: 'Алматы - Астана',
    cargoDescription: 'Стройматериалы',
    cargoWeightKg: 18000,
    issuer: { id: 'c-1', name: 'ТОО «Парк»', directorName: '—', orgDetails: '', bankDetails: '', stampImage: null, signatureImage: null },
};

const точка = (pointType: string, city: string, address: string, date: string | null) => ({
    pointType, expectedDate: date ? new Date(date) : null,
    location: { name: null, city, address, cityRecord: null },
});

function собрать(заявка: any = {}, через: any = null) {
    const prisma: any = {
        order: {
            findUnique: jest.fn().mockResolvedValue({
                assignedDriverName: null, assignedDriverPhone: '+77051234567', assignedDriverPlate: '888FRE02', assignedDriverTrailer: '45ПП02',
                driver: {
                    id: 'u-d', lastName: 'Иванов', firstName: 'Иван', middleName: null, phone: '+77050000000', iin: '900101300123',
                    vehicleModel: 'Volvo FH', vehiclePlate: '111OLD02', trailerNumber: '99OLD02',
                    docType: 'ID_CARD', docNumber: '049123456', docIssuedAt: new Date('2019-03-12T00:00:00Z'), docIssuedBy: 'МВД РК', docExpiresAt: new Date('2029-03-12T00:00:00Z'),
                },
                routePoints: [
                    точка('PICKUP', 'Алматы', 'ул. Складская, 5', '2026-10-31T04:00:00Z'),
                    точка('DELIVERY', 'Астана', 'пр. Республики, 1', '2026-11-02T04:00:00Z'),
                ],
                ...заявка,
            }),
        },
        user: { findUnique: jest.fn().mockResolvedValue({ lastName: 'Паркова', firstName: 'Алия', phone: '+77010001403', company: { name: 'ТОО «Отправитель»' } }) },
        exchangeDriver: { findUnique: jest.fn().mockResolvedValue(через) },
    };
    return { service: new PowerOfAttorneyService(prisma, {} as any), prisma };
}

describe('Письмо с доверенностью: данные', () => {
    it('маршрут с адресами и датами, машина рейса, водитель с телефоном, документом и ИИН', async () => {
        const { service } = собрать();
        const d = await service.emailData('o-1', 'c-1', { snapshot: СНИМОК, senderUserId: 'u-1' });
        expect(d.from).toMatchObject({ city: 'Алматы', address: 'ул. Складская, 5' });
        expect(d.to).toMatchObject({ city: 'Астана', address: 'пр. Республики, 1' });
        // Машина — та, что в рейсе, а не последняя из карточки водителя.
        expect(d.vehicle).toBe('Volvo FH · 888FRE02');
        expect(d.trailer).toBe('45ПП02');
        expect(d.driver).toEqual({
            name: 'Иванов Иван',
            phone: '+77051234567',
            document: 'Удостоверение личности № 049123456, выдано 12.03.2019 МВД РК, действительно до 12.03.2029',
            iin: '900101300123',
        });
        // Разряды — неразрывным пробелом: «18 000» не разорвётся по строкам.
        expect(d.cargo?.replace(/ /g, ' ')).toBe('Стройматериалы, 18 000 кг');
        expect(d.sender).toEqual({ name: 'Паркова Алия', phone: '+77010001403' });
        // Отправляет компания того, кто нажал «Отправить», а не выписавшая бланк.
        expect(d.senderCompany).toBe('ТОО «Отправитель»');
    });

    it('у старого рейса без машины в заявке — номер и прицеп из карточки, как раньше', async () => {
        const { service } = собрать({ assignedDriverPlate: null, assignedDriverTrailer: null });
        const d = await service.emailData('o-1', 'c-1', { snapshot: СНИМОК });
        expect(d.vehicle).toBe('Volvo FH · 111OLD02');
        expect(d.trailer).toBe('99OLD02');
    });

    it('водитель парка: ИИН и марка из анкеты, если в карточке их нет', async () => {
        const { service } = собрать(
            { driver: { id: 'u-d', lastName: 'Иванов', firstName: 'Иван', middleName: null, phone: null, iin: null, vehicleModel: null, vehiclePlate: null, trailerNumber: null } },
            { iin: '880202400456', vehicleModel: 'MAN TGX', phone: '+77019998877' },
        );
        const d = await service.emailData('o-1', 'c-1', { snapshot: СНИМОК });
        expect(d.driver.iin).toBe('880202400456');
        expect(d.vehicle).toBe('MAN TGX · 888FRE02');
    });

    it('водителя заменили после этой версии — в письме только то, что в доверенности', async () => {
        const { service } = собрать({ driver: { id: 'u-2', lastName: 'Петров', firstName: 'Пётр', middleName: null, phone: '+77000000000', iin: '1' } });
        const d = await service.emailData('o-1', 'c-1', { snapshot: СНИМОК });
        expect(d.driver).toEqual({
            name: 'Иванов Иван', phone: null, iin: null,
            document: 'Удостоверение личности № 049123456, выдано 12.03.2019 МВД РК',
        });
        expect(d.vehicle).toBe('Volvo FH 123ABC02 ПП 45ПП02');
    });
});

describe('Письмо с доверенностью: вид', () => {
    const данные = {
        orderNumber: 'ЗК-2601', senderCompany: 'ТОО «Парк»', sender: { name: 'Паркова Алия', phone: '+77010001403' },
        validTo: '2026-11-05T05:00:00Z',
        from: { city: 'Алматы', address: 'ул. Складская, 5', date: '2026-10-31T04:00:00Z' },
        to: { city: 'Астана', address: 'пр. Республики, 1 <корп. 2>' },
        vehicle: 'Volvo FH · 888FRE02', trailer: '45ПП02',
        driver: { name: 'Иванов Иван', phone: '+7 705 123 45 67', document: 'Удостоверение личности № 049123456', iin: '900101300123' },
    };

    it('тема называет заявку, водителя и маршрут', () => {
        expect(poaEmail(данные).subject).toBe('Доверенность по заявке № ЗК-2601 · водитель Иванов Иван · Алматы → Астана');
    });

    it('в теле — маршрут, машина и водитель; адрес из данных не ломает разметку', () => {
        const { html } = poaEmail(данные);
        for (const текст of ['Алматы, ул. Складская, 5, 31.10.2026', 'Volvo FH · 888FRE02', '45ПП02', 'Иванов Иван', '049123456', '900101300123', 'действительна до 05.11.2026']) {
            expect(html).toContain(текст);
        }
        expect(html).toContain('пр. Республики, 1 &lt;корп. 2&gt;');
        expect(html).toContain('href="tel:+77051234567"');
    });

    it('город в адресе не повторяется: «Алматы, Абая 10» и «г. Алматы»', () => {
        const { text } = poaEmail({
            ...данные,
            from: { city: 'Алматы', name: 'Склад Тест', address: 'Алматы, Абая 10' },
            to: { city: 'Шымкент', address: 'г. Шымкент' },
        });
        expect(text).toContain('Откуда: Алматы, Склад Тест, Абая 10');
        expect(text).toContain('Куда: Шымкент\n');
    });

    it('есть простой текст — в программах, что не показывают разметку, письмо не пустое', () => {
        const { text } = poaEmail(данные);
        expect(text).toContain('Откуда: Алматы, ул. Складская, 5, 31.10.2026');
        expect(text).toContain('ФИО: Иванов Иван');
        expect(text).toContain('Документ: Удостоверение личности № 049123456');
    });

    it('пустые строки не показываются', () => {
        const { html, text } = poaEmail({ orderNumber: '1', senderCompany: 'ТОО', driver: { name: 'Иванов Иван' } });
        expect(html).not.toContain('Прицеп');
        expect(html).not.toContain('Машина');
        expect(text).not.toContain('Телефон');
    });
});
