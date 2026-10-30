import { ConfigService } from '@nestjs/config';
import { buildParkContract, contractGaps, contractNumber, CREW_RENTAL_LEASED_VERSION, ParkContractInput, PARK_CONTRACT_VERSION } from './park-contract';
import { renderParkContractPdf } from './park-contract-pdf';
import { ParkContractService } from './park-contract.service';

const input = (over: Partial<ParkContractInput> = {}): ParkContractInput => ({
    number: 'ПА-261009-ABC123',
    date: new Date('2026-10-09T08:00:00Z'),
    park: {
        name: 'ТОО «Парк А»', bin: '123456789012', address: 'г. Астана, ул. Кенесары, 1', directorName: 'Иванов И. И.',
        bankAccount: 'KZ000000000000000001', bankName: 'Банк А', bankBic: 'BANKKZKA', kbe: '17', phone: '+77010000001',
    },
    driver: {
        lastName: 'Сериков', firstName: 'Серик', middleName: 'Серикович', iin: '900101300007',
        idNumber: '045123456', idIssuedBy: 'МВД РК', idIssuedAt: new Date('2016-03-15T00:00:00Z'),
        registrationAddress: 'г. Алматы, ул. Абая, 1', phone: '+77011234567', payoutIban: null, payoutBank: null,
    },
    vehicle: { model: 'MAN TGX', plate: '123ABC02', regNumber: 'AB1234567', bodyType: 'тент', capacityKg: 20000, isOwn: true },
    ...over,
});

describe('Договор водителя с парком: текст', () => {
    it('номер — день подписи и хвост анкеты', () => {
        expect(contractNumber('ckxyzabc123', new Date('2026-10-09T23:00:00Z'))).toBe('ПА-261009-ABC123');
    });

    it('в тексте — стороны, машина, доля парка и версия шаблона', () => {
        const c = buildParkContract(input());
        const all = [c.preamble, ...c.sections.flatMap((s) => s.items.map((i) => i.text))].join('\n');
        expect(c.version).toBe(PARK_CONTRACT_VERSION);
        expect(c.title).toContain('ПА-261009-ABC123');
        expect(c.preamble).toContain('ТОО «Парк А»');
        expect(c.preamble).toContain('Сериков Серик Серикович');
        expect(all).toContain('MAN TGX');
        expect(all).toContain('123ABC02');
        expect(all).toContain('техпаспорт) № AB1234567');
        // Расчёт «на руки» (12.10.2026): налоги сверху, топливо — по чекам на БИН парка.
        expect(all).toContain('сумма на руки');
        expect(all).toContain('указывается БИН Арендатора');
        expect(all).toContain('статьи 585–591');
        expect(c.lessor.lines.find((l) => l.label === 'Удостоверение личности')?.value).toBe('№ 045123456, выдано МВД РК 15.03.2016');
    });

    it('своя машина — аренда с экипажем, текст и версия прежние', () => {
        const c = buildParkContract(input());
        expect(c.kind).toBe('CREW_RENTAL');
        expect(c.version).toBe(PARK_CONTRACT_VERSION);
        expect([c.lessee.role, c.lessor.role]).toEqual(['Арендатор', 'Арендодатель']);
        expect(c.sections[0].items.find((i) => i.n === '1.3.')?.text).toBe('Транспортное средство принадлежит Арендодателю на праве собственности.');
    });

    it('машина не своя — тот же договор, машина у водителя по договору с хозяином, парк в нём не участвует (31.10.2026)', () => {
        const своя = buildParkContract(input());
        const c = buildParkContract(input({
            vehicle: { ...input().vehicle, isOwn: false, ownerContract: { ownerName: 'Сериков Арман', number: 'ВА-261031-ABC123', date: new Date('2026-10-31T00:00:00Z') } },
        }));
        const текст = (k: typeof c) => k.sections.flatMap((s) => s.items).map((i) => `${i.n} ${i.text}`);
        expect(c.kind).toBe('CREW_RENTAL');
        expect(c.version).toBe(CREW_RENTAL_LEASED_VERSION);
        expect(c.title).toMatch(/^Договор аренды транспортного средства с экипажем № /);
        expect([c.lessee.role, c.lessor.role]).toEqual(['Арендатор', 'Арендодатель']);
        const п13 = c.sections[0].items.find((i) => i.n === '1.3.')!.text;
        expect(п13).toContain('на основании договора аренды с собственником (Сериков Арман, договор № ВА-261031-ABC123 от 31.10.2026)');
        expect(п13).toContain('Арендатор стороной этого договора не является');
        expect(п13).toContain('плату за пользование Транспортным средством собственнику не вносит');
        // Отличаются только 1.3, 3.2 и 3.4 — деньги и остальное как со своей машиной.
        const разные = текст(c).filter((t, i) => t !== текст(своя)[i]).map((t) => t.split(' ')[0]);
        expect(разные).toEqual(['1.3.', '3.2.', '3.4.']);
    });

    it('машина не своя, договора с хозяином ещё нет — ссылка без номера', () => {
        const c = buildParkContract(input({ vehicle: { ...input().vehicle, isOwn: false } }));
        expect(c.sections[0].items.find((i) => i.n === '1.3.')!.text).toContain('на основании договора аренды с собственником, допускающего');
    });

    it('чего не хватает для подписи — словами; всё есть — пусто', () => {
        expect(contractGaps(input())).toEqual([]);
        const gaps = contractGaps(input({
            park: { ...input().park, bin: null, directorName: null },
            driver: { ...input().driver, registrationAddress: null },
            vehicle: { ...input().vehicle, regNumber: null },
        }));
        expect(gaps).toEqual([
            'парк не указал БИН',
            'парк не указал, кто подписывает договор (директор)',
            'адрес прописки',
            'номер техпаспорта',
        ]);
    });

    it('PDF собирается и называет номер договора', async () => {
        const pdf = await renderParkContractPdf(
            buildParkContract(input()),
            { signedAt: new Date('2026-10-09T08:05:00Z'), device: 'device-1', ip: '10.0.0.1' },
            { stamp: null, signature: null },
        );
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pdf.length).toBeGreaterThan(5000);
    });

    it('PDF договора услуг собирается тоже', async () => {
        const pdf = await renderParkContractPdf(
            buildParkContract(input({ vehicle: { ...input().vehicle, isOwn: false } })),
            { signedAt: new Date('2026-10-09T08:05:00Z'), device: null, ip: null },
            { stamp: null, signature: null },
        );
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    });
});

describe('Договор водителя с парком: ссылка на PDF', () => {
    const contract = {
        id: 'c-1', number: 'ПА-261009-ABC123', version: PARK_CONTRACT_VERSION, content: buildParkContract(input()),
        signedAt: new Date('2026-10-09T08:05:00Z'), signedDevice: null, signedIp: null, parkCompanyId: 'park-1',
    };
    const build = () => {
        const prisma: any = {
            exchangeDriver: { findUnique: jest.fn().mockResolvedValue({ id: 'd-1', parkCompanyId: 'park-1' }) },
            exchangeDriverContract: { findFirst: jest.fn().mockResolvedValue(contract), findUnique: jest.fn().mockResolvedValue(contract) },
            company: { findUnique: jest.fn().mockResolvedValue({ id: 'park-1', stampImage: null, signatureImage: null }) },
        };
        const stamps: any = { loadFor: jest.fn().mockResolvedValue({ stamp: null, signature: null }) };
        const config = { get: () => 'test-secret' } as unknown as ConfigService;
        return new ParkContractService(prisma, stamps, config);
    };

    it('своя ссылка открывает PDF', async () => {
        const service = build();
        const { path } = await service.driverLink('u-1');
        const token = path.split('/').pop()!;
        const file = await service.pdfByLink(token);
        expect(file.number).toBe('ПА-261009-ABC123');
        expect(file.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('подделанная или просроченная ссылка — «не найдено»', async () => {
        const service = build();
        const { path } = await service.driverLink('u-1');
        const [id, expires, mac] = path.split('/').pop()!.split('.');
        await expect(service.pdfByLink(`${id}.${Number(expires) + 60_000}.${mac}`)).rejects.toThrow(/устарела/);
        await expect(service.pdfByLink(`${id}.${Date.now() - 1}.${mac}`)).rejects.toThrow(/устарела/);
        await expect(service.pdfByLink('мусор')).rejects.toThrow(/устарела/);
    });
});
