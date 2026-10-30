import { buildDriverOwnerContract, driverOwnerContractGaps, driverOwnerContractNumber, DriverOwnerContractInput, DRIVER_OWNER_CONTRACT_VERSION } from './driver-owner-contract';
import { renderParkContractPdf } from './park-contract-pdf';

/** Владелец, 31.10.2026: договор с хозяином машины — у водителя, парк ни при чём. */
function input(over: Partial<DriverOwnerContractInput> = {}): DriverOwnerContractInput {
    return {
        number: driverOwnerContractNumber('ck123abc456', new Date('2026-10-31T00:00:00Z')),
        date: new Date('2026-10-31T00:00:00Z'),
        owner: {
            kind: 'PERSON', name: 'Сериков Арман Болатович', iinBin: '850101300111', idNumber: '045678912', idIssuedBy: 'МВД РК',
            idIssuedAt: new Date('2018-05-10T00:00:00Z'), address: 'г. Шымкент, ул. Тауке хана, 5', phone: '+77011112233',
            iban: null, bank: null, bankBic: null, signer: null,
        },
        vehicle: { model: 'MAN TGX', plate: '123ABC13', regNumber: 'AB1234567' },
        driver: {
            lastName: 'Рулев', firstName: 'Нурлан', middleName: null, iin: '900101300123', idNumber: '049123456', idIssuedBy: 'МВД РК',
            idIssuedAt: new Date('2019-03-12T00:00:00Z'), registrationAddress: 'г. Шымкент, мкр. Нурсат, 10', phone: '+77010001401',
            payoutIban: null, payoutBank: null,
        },
        rent: null,
        ...over,
    };
}

const всё = (c: ReturnType<typeof buildDriverOwnerContract>) => [c.preamble, ...c.sections.flatMap((s) => s.items.map((i) => i.text))].join('\n');

describe('Договор водителя с хозяином машины', () => {
    it('стороны — хозяин и водитель; парка в договоре нет', () => {
        const c = buildDriverOwnerContract(input());
        expect(c.version).toBe(DRIVER_OWNER_CONTRACT_VERSION);
        expect(c.number).toBe('ВА-261031-ABC456');
        expect([c.lessee.role, c.lessee.name]).toEqual(['Арендатор', 'Рулев Нурлан']);
        expect([c.lessor.role, c.lessor.name]).toEqual(['Арендодатель', 'Сериков Арман Болатович']);
        expect(c.preamble).toBe('Сериков Арман Болатович, ИИН 850101300111, далее — «Арендодатель», с одной стороны, и Рулев Нурлан, ИИН 900101300123, далее — «Арендатор», с другой стороны, вместе — «Стороны», заключили настоящий договор аренды транспортного средства без экипажа о нижеследующем.');
        expect(c.lesseeSigner).toBe('Рулев Нурлан');
        expect(всё(c)).not.toMatch(/БИН парка|LogiCore/);
    });

    it('водитель вправе возить для третьих лиц с машиной и собой за рулём; они перед хозяином не отвечают', () => {
        const t = всё(buildDriverOwnerContract(input()));
        expect(t).toContain('Арендодатель настоящим даёт на это согласие');
        expect(t).toContain('не отвечают по обязательствам Арендатора, в том числе по арендной плате');
    });

    it('плату не вписали — пустое место для руки; вписали — сумма', () => {
        const пусто = buildDriverOwnerContract(input()).sections[2].items[0].text;
        expect(пусто).toBe('Арендная плата составляет ______________________ тенге за ______________________ (рейс, месяц).');
        const сумма = buildDriverOwnerContract(input({ rent: { amount: 150000, basis: 'MONTH' } })).sections[2].items[0].text;
        expect(сумма.replace(/ /g, ' ')).toContain('150 000 тенге за каждый календарный месяц аренды');
    });

    it('оформлен ночью — число по Алматы, а не вчерашнее по Гринвичу', () => {
        const ночью = new Date('2026-10-30T20:30:00Z'); // 31.10, 01:30 в Алматы
        expect(driverOwnerContractNumber('ck123abc456', ночью)).toBe('ВА-261031-ABC456');
        expect(buildDriverOwnerContract(input({ date: ночью })).date).toBe('2026-10-31');
    });

    it('чего не хватает — словами; всё есть — пусто', () => {
        expect(driverOwnerContractGaps(input())).toEqual([]);
        const gaps = driverOwnerContractGaps(input({
            owner: { ...input().owner, iinBin: null, address: null },
            vehicle: { ...input().vehicle, regNumber: null },
        }));
        expect(gaps).toEqual(['ИИН хозяина машины', 'адрес прописки хозяина', 'номер техпаспорта']);
    });

    it('PDF собирается без печати парка', async () => {
        const pdf = await renderParkContractPdf(buildDriverOwnerContract(input()), null, { stamp: null, signature: null });
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pdf.length).toBeGreaterThan(5000);
    });
});
