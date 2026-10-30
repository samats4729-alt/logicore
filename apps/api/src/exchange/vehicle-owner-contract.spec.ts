import { Prisma } from '@prisma/client';
import { renderParkContractPdf } from './park-contract-pdf';
import {
    buildVehicleOwnerContract, ownerContractGaps, ownerContractNumber, VehicleOwnerContractInput, VEHICLE_OWNER_CONTRACT_VERSION,
} from './vehicle-owner-contract';
import { VehicleOwnerContractService } from './vehicle-owner-contract.service';

/**
 * Договор парка с владельцем машины (задачи шефа, Q9, решение владельца
 * 25.10.2026): машина водителя записана на другого — парк арендует её без
 * экипажа, подписывают на бумаге, скан — в кабинете парка.
 */
const PARK = {
    name: 'ТОО «Парк А»', bin: '123456789012', address: 'г. Астана, ул. Кенесары, 1', directorName: 'Иванов И. И.',
    bankAccount: 'KZ000000000000000001', bankName: 'Банк А', bankBic: 'BANKKZKA', kbe: '17', phone: '+77010000001',
};

const input = (over: Partial<VehicleOwnerContractInput> = {}): VehicleOwnerContractInput => ({
    number: 'АТ-261026-ABC123',
    date: new Date('2026-10-26T08:00:00Z'),
    park: PARK,
    owner: {
        kind: 'PERSON', name: 'Ахметов Ахмет Ахметович', iinBin: '800101300001',
        idNumber: '012345678', idIssuedBy: 'МВД РК', idIssuedAt: new Date('2015-05-05T00:00:00Z'),
        address: 'г. Караганда, ул. Ленина, 5', phone: '+77019998877', iban: 'KZ123456789012345678', bank: 'Kaspi Bank',
        bankBic: null, signer: null,
    },
    vehicle: { model: 'Volvo FH', plate: '777ABC09', regNumber: 'KA0001234' },
    driver: { name: 'Сериков Серик Серикович', iin: '900101300007' },
    rent: { amount: 50000, basis: 'TRIP' },
    ...over,
});

const text = (c: ReturnType<typeof buildVehicleOwnerContract>) => [c.preamble, ...c.sections.flatMap((s) => s.items.map((i) => i.text))].join('\n');

describe('Договор с владельцем машины: текст', () => {
    it('аренда без экипажа: стороны, машина, водитель, плата за рейс', () => {
        const c = buildVehicleOwnerContract(input());
        const all = text(c);
        expect(c.kind).toBe('VEHICLE_RENTAL');
        expect(c.version).toBe(VEHICLE_OWNER_CONTRACT_VERSION);
        expect(c.title).toBe('Договор аренды транспортного средства без экипажа № АТ-261026-ABC123');
        expect([c.lessee.role, c.lessor.role]).toEqual(['Арендатор', 'Арендодатель']);
        expect(c.lessee.name).toBe('ТОО «Парк А»');
        expect(all).toContain('статья 594-1');
        expect(all).toContain('Volvo FH, государственный номер 777ABC09, свидетельство о регистрации (техпаспорт) № KA0001234');
        // Кто за рулём — водитель парка, а не владелец.
        expect(all).toContain('Сериков Серик Серикович, ИИН 900101300007');
        expect(all).toMatch(/50\s000 тенге за каждый Рейс/);
        // Владелец без ИП — парк удерживает налог как налоговый агент.
        expect(all).toMatch(/налогового агента/);
        expect(c.lessor.lines.find((l) => l.label === 'Удостоверение личности')?.value).toBe('№ 012345678, выдано МВД РК 05.05.2015');
    });

    it('плата за месяц и владелец-организация: налоги платит сам, подписывает его представитель', () => {
        const c = buildVehicleOwnerContract(input({
            owner: { ...input().owner, kind: 'COMPANY', name: 'ТОО «Машины»', iinBin: '010140001111', idNumber: null, idIssuedBy: null, idIssuedAt: null, signer: 'Петров П. П.', bankBic: 'CASPKZKA' },
            rent: { amount: 300000, basis: 'MONTH' },
        }));
        const all = text(c);
        expect(all).toMatch(/300\s000 тенге за каждый календарный месяц/);
        expect(all).toMatch(/Арендодатель исчисляет и уплачивает самостоятельно/);
        expect(all).not.toMatch(/налогового агента/);
        expect(c.preamble).toContain('в лице уполномоченного представителя');
        expect(c.lessorSigner).toBe('Петров П. П.');
        expect(c.lessor.lines.map((l) => l.label)).toEqual(['БИН/ИИН', 'Юридический адрес', 'ИИК', 'Банк', 'БИК', 'Телефон']);
    });

    it('номер — день оформления и хвост', () => {
        expect(ownerContractNumber('a1b2c3d4', new Date('2026-10-26T20:00:00Z'))).toBe('АТ-261026-B2C3D4');
    });

    it('чего не хватает для подписи — словами; всё есть — пусто', () => {
        expect(ownerContractGaps(input())).toEqual([]);
        const gaps = ownerContractGaps(input({
            park: { ...PARK, directorName: null },
            owner: { ...input().owner, idIssuedBy: null, iban: null },
            vehicle: { model: 'Volvo FH', plate: '777ABC09', regNumber: null },
        }));
        expect(gaps).toEqual([
            'в кабинете парка не указано, кто подписывает договоры (директор)',
            'удостоверение личности владельца (номер и кем выдано)',
            'счёт владельца (IBAN) — на него платится аренда',
            'номер техпаспорта',
        ]);
    });

    it('PDF для подписи на бумаге собирается: за владельца — строка для подписи', async () => {
        const pdf = await renderParkContractPdf(buildVehicleOwnerContract(input()), null, { stamp: null, signature: null });
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pdf.length).toBeGreaterThan(5000);
    });
});

describe('Договор с владельцем машины: кто и что может', () => {
    const DTO = {
        ownerKind: 'PERSON' as const, ownerName: 'Ахметов Ахмет Ахметович', ownerIinBin: '800101300001',
        ownerIdNumber: '012345678', ownerIdIssuedBy: 'МВД РК', ownerIdIssuedAt: '2015-05-05',
        ownerAddress: 'г. Караганда, ул. Ленина, 5', ownerPhone: '+77019998877', ownerIban: 'KZ123456789012345678', ownerBank: 'Kaspi Bank',
        vehicleModel: 'Volvo FH', vehiclePlate: '777 abc 09', vehicleRegNumber: 'KA0001234', rentAmount: 50000, rentBasis: 'TRIP' as const,
    };

    function build() {
        const rows: any[] = [];
        const driver = { id: 'd-1', lastName: 'Сериков', firstName: 'Серик', middleName: null, iin: '900101300007', vehicleIsOwn: false, vehiclePlate: '777ABC09', vehicleModel: 'Volvo FH', vehicleRegNumber: 'KA0001234' };
        const prisma: any = {
            exchangeDriver: { findFirst: jest.fn(async ({ where }: any) => (where.parkCompanyId === 'park-1' && where.id === 'd-1' ? driver : null)) },
            company: { findUnique: jest.fn(async ({ select }: any) => (select.stampImage ? { id: 'park-1', stampImage: null, signatureImage: null } : PARK)) },
            exchangeVehicleOwnerContract: {
                create: jest.fn(async ({ data }: any) => { const row = { id: `oc-${rows.length + 1}`, createdAt: new Date('2026-10-26T08:00:00Z'), signedAt: null, signedFileUrl: null, ...data }; rows.push(row); return row; }),
                findFirst: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id && r.parkCompanyId === where.parkCompanyId) ?? null),
                findMany: jest.fn(async () => rows),
                update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
            },
        };
        const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn(), deleteFile: jest.fn() };
        const stamps: any = { loadFor: jest.fn().mockResolvedValue({ stamp: null, signature: null }) };
        return { service: new VehicleOwnerContractService(prisma, s3, stamps), rows, s3 };
    }

    /** Прежний черновик парка (до 31.10.2026): оформить новый уже нельзя, этот — дописать и подписать. */
    function черновикПарка(rows: any[], over: Record<string, unknown> = {}) {
        const row = {
            id: 'oc-1', parkCompanyId: 'park-1', driverId: 'd-1', number: 'АТ-261026-B2C3D4', status: 'DRAFT', lessee: 'PARK',
            createdAt: new Date('2026-10-26T08:00:00Z'), signedAt: null, signedFileUrl: null, content: {},
            ...DTO, vehiclePlate: '777ABC09', ownerIdIssuedAt: new Date('2015-05-05T00:00:00Z'), rentAmount: new Prisma.Decimal(50000), ...over,
        };
        rows.push(row);
        return row;
    }

    it('новый договор «парк арендует машину» не оформляется — его составляет водитель (31.10.2026)', async () => {
        const { service, rows } = build();
        await expect(service.create('park-1', 'u-1', 'd-1', DTO)).rejects.toThrow(/составляет сам водитель в приложении/);
        expect(rows).toHaveLength(0);
    });

    it('чужой парк не видит и не скачивает', async () => {
        const { service, rows } = build();
        const c = черновикПарка(rows);
        await expect(service.list('park-2', 'd-1')).rejects.toThrow('Водитель не найден');
        await expect(service.pdf('park-2', c.id)).rejects.toThrow('Договор не найден');
        await expect(service.update('park-2', c.id, DTO)).rejects.toThrow('Договор не найден');
    });

    it('прежний черновик парка с пропусками — PDF не печатается и скан не принимается', async () => {
        const { service, rows } = build();
        const c = черновикПарка(rows, { ownerIban: null });
        const { items } = await service.list('park-1', 'd-1');
        expect(items[0].gaps).toEqual(['счёт владельца (IBAN) — на него платится аренда']);
        await expect(service.pdf('park-1', c.id)).rejects.toThrow(/не хватает: счёт владельца/);
        const file: any = { originalname: 'scan.pdf', mimetype: 'application/pdf', size: 1000, buffer: Buffer.from('x') };
        await expect(service.attachSigned('park-1', c.id, file)).rejects.toThrow(/не готов к подписи/);
    });

    it('прежний черновик парка: скан приложен — договор подписан и больше не правится', async () => {
        const { service, rows } = build();
        const c = черновикПарка(rows);
        const pdf = await service.pdf('park-1', c.id);
        expect(pdf.pdf.subarray(0, 5).toString()).toBe('%PDF-');
        await expect(service.attachSigned('park-1', c.id, { originalname: 'virus.exe', mimetype: 'application/x-msdownload', size: 10, buffer: Buffer.from('x') } as any))
            .rejects.toThrow(/PDF или фотография/);
        const signed = await service.attachSigned('park-1', c.id, { originalname: 'scan.pdf', mimetype: 'application/pdf', size: 1000, buffer: Buffer.from('x') } as any);
        expect(signed.status).toBe('SIGNED');
        await expect(service.update('park-1', c.id, { ...DTO, rentAmount: 1 })).rejects.toThrow(/уже подписан/);
        await expect(service.signedFile('park-1', c.id)).resolves.toMatchObject({ fileName: 'scan.pdf', mimeType: 'application/pdf' });
    });

    it('договор водителя с хозяином: парк видит и печатает без своей печати, но не правит', async () => {
        const { service, rows } = build();
        const c = черновикПарка(rows, { rentAmount: new Prisma.Decimal(0) as any });
        Object.assign(c, { lessee: 'DRIVER', rentBasis: 'NONE', content: buildVehicleOwnerContract(input()) });
        const { items } = await service.list('park-1', 'd-1');
        expect(items[0]).toMatchObject({ lessee: 'DRIVER', rentAmount: null, gaps: [] });
        await expect(service.update('park-1', c.id, DTO)).rejects.toThrow(/парк его не правит/);
        const pdf = await service.pdf('park-1', c.id);
        expect(pdf.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    });
});
