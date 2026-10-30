import { Prisma } from '@prisma/client';
import { DriverOwnerContractService } from './driver-owner-contract.service';

/** Договор водителя с хозяином машины: водитель составляет сам, парк не сторона (31.10.2026). */
const DRIVER = {
    id: 'd-1', kind: 'PARK', parkCompanyId: 'park-1', lastName: 'Рулев', firstName: 'Нурлан', middleName: null, iin: '900101300123',
    idNumber: '049123456', idIssuedBy: 'МВД РК', idIssuedAt: null, registrationAddress: 'г. Шымкент, мкр. Нурсат, 10', phone: '+77010001401',
    vehicleModel: 'MAN TGX', vehiclePlate: '123ABC13', vehicleRegNumber: 'AB1234567', vehicleIsOwn: false, vehicleOwnerIin: '850101300111',
};
const DTO = {
    ownerKind: 'PERSON' as const, ownerName: 'Сериков Арман', ownerIinBin: '850101300111', ownerIdNumber: '045678912',
    ownerIdIssuedBy: 'МВД РК', ownerAddress: 'г. Шымкент, ул. Тауке хана, 5',
};

function build(driver: any = DRIVER) {
    const rows: any[] = [];
    const prisma: any = {
        exchangeDriver: { findUnique: jest.fn().mockResolvedValue(driver) },
        exchangeVehicleOwnerContract: {
            findFirst: jest.fn(async ({ where }: any) => [...rows].reverse().find((r) => (!where.driverId || r.driverId === where.driverId) && (!where.id || r.id === where.id) && r.lessee === where.lessee) ?? null),
            create: jest.fn(async ({ data, select }: any) => { const row = { id: `oc-${rows.length + 1}`, createdAt: new Date('2026-10-31T05:00:00Z'), signedAt: null, signedFileName: null, signedFileUrl: null, ...data }; rows.push(row); return row; }),
            update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
        },
    };
    const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn(), deleteFile: jest.fn() };
    const config: any = { get: () => 'secret' };
    return { service: new DriverOwnerContractService(prisma, s3, config), rows };
}

describe('Договор водителя с хозяином машины', () => {
    it('машина своя — договор не нужен и не составляется', async () => {
        const { service } = build({ ...DRIVER, vehicleIsOwn: true, vehicleOwnerIin: DRIVER.iin });
        await expect(service.mine('u-1')).resolves.toMatchObject({ needed: false, contract: null });
        await expect(service.save('u-1', DTO)).rejects.toThrow(/машина ваша/);
    });

    it('машина чужая — черновик водителя, парк не сторона; плата не вписана — пусто в бланке', async () => {
        const { service, rows } = build();
        const c = await service.save('u-1', DTO);
        expect(rows[0]).toMatchObject({ lessee: 'DRIVER', status: 'DRAFT', parkCompanyId: 'park-1', rentBasis: 'NONE', vehiclePlate: '123ABC13' });
        expect(rows[0].rentAmount).toEqual(new Prisma.Decimal(0));
        expect(rows[0].number).toMatch(/^ВА-\d{6}-[0-9A-F]{6}$/);
        expect(c).toMatchObject({ rentAmount: null, rentBasis: null, gaps: [] });
        expect(rows[0].content.sections[2].items[0].text).toContain('______');
    });

    it('правка до подписи — тот же договор; после фото подписанного — новый', async () => {
        const { service, rows } = build();
        await service.save('u-1', DTO);
        await service.save('u-1', { ...DTO, rentAmount: 150000, rentBasis: 'MONTH' });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ rentBasis: 'MONTH' });
        const signed = await service.attachSigned('u-1', { originalname: 'dogovor.jpg', mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x') } as any);
        expect(signed.status).toBe('SIGNED');
        await service.save('u-1', { ...DTO, ownerName: 'Другой хозяин' });
        expect(rows).toHaveLength(2);
    });

    it('PDF — по ссылке на десять минут, подделанная ссылка не открывается', async () => {
        const { service } = build();
        await service.save('u-1', DTO);
        const { path } = await service.link('u-1');
        const token = path.split('/').pop()!;
        const file = await service.pdfByLink(token);
        expect(file.pdf.subarray(0, 5).toString()).toBe('%PDF-');
        await expect(service.pdfByLink(token.replace(/.$/, (ch) => (ch === 'a' ? 'b' : 'a')))).rejects.toThrow(/устарела/);
    });

    it('с пробелами — PDF не печатается', async () => {
        const { service } = build();
        await service.save('u-1', { ...DTO, ownerIinBin: null });
        await expect(service.link('u-1')).rejects.toThrow(/не хватает: ИИН хозяина машины/);
    });
});
