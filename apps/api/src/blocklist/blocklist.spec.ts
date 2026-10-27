import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertNotBlocked, findBlock, normalizeBlockValue } from './blocklist';
import { BlocklistService } from './blocklist.service';

/** Чёрный список компании (F5/S2). */
describe('чёрный список компании', () => {
    it('значения сравниваются приведёнными: телефон, БИН, госномер', () => {
        expect(normalizeBlockValue('PHONE', '8 (701) 123-45-67')).toBe('+77011234567');
        expect(normalizeBlockValue('PHONE', '+7 701 1234567')).toBe('+77011234567');
        // Зарубежный — цифрами, без попытки сделать из него казахстанский.
        expect(normalizeBlockValue('PHONE', '+998 90 123 45 67')).toBe('998901234567');
        expect(normalizeBlockValue('BIN_IIN', '1234 5678 9012')).toBe('123456789012');
        expect(normalizeBlockValue('PLATE', '123 abc-02')).toBe('123ABC02');
    });

    it('ищет по своей компании и только по заполненным значениям', async () => {
        const prisma: any = { companyBlocklist: { findFirst: jest.fn().mockResolvedValue(null) } };
        await findBlock(prisma, 'c1', { binIin: [null, ''], phones: [undefined] });
        expect(prisma.companyBlocklist.findFirst).not.toHaveBeenCalled();

        await findBlock(prisma, 'c1', { binIin: ['123456789012'], phones: ['87011234567'], plates: ['123abc02'] });
        expect(prisma.companyBlocklist.findFirst.mock.calls[0][0].where).toEqual({
            companyId: 'c1',
            OR: [
                { kind: 'BIN_IIN', value: '123456789012' },
                { kind: 'PHONE', value: '+77011234567' },
                { kind: 'PLATE', value: '123ABC02' },
            ],
        });
    });

    it('совпало — понятный отказ: что совпало, кто это и за что', async () => {
        const prisma: any = {
            companyBlocklist: { findFirst: jest.fn().mockResolvedValue({ kind: 'PHONE', value: '+77011234567', name: 'ТОО «Призрак»', reason: 'взял груз и пропал' }) },
        };
        await expect(assertNotBlocked(prisma, 'c1', { phones: ['87011234567'] })).rejects.toThrow(
            /^Телефон \+77011234567 \(«ТОО «Призрак»»\) в чёрном списке вашей компании: взял груз и пропал/,
        );
    });

    describe('сервис', () => {
        function setup() {
            const prisma: any = {
                companyBlocklist: {
                    create: jest.fn(async ({ data }: any) => ({ id: 'b1', ...data })),
                    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
                },
                company: {
                    findMany: jest.fn(async ({ where }: any) => {
                        // Первый вызов — база водителей (своя компания и её перевозчики),
                        // дальше — поиск карточек справочника.
                        if (where?.OR) return [{ id: 'c1', name: 'Мы' }];
                        return [{ id: 'ext-1', name: 'ТОО «Призрак»', phone: '8 701 123 45 67', bin: '123456789012' }];
                    }),
                },
                user: { findMany: jest.fn().mockResolvedValue([{ id: 'd1', firstName: 'Иван', lastName: 'Петров', phone: '+77011234567', vehiclePlate: null }]) },
                vehicle: { findMany: jest.fn().mockResolvedValue([]) },
            };
            return { prisma, service: new BlocklistService(prisma) };
        }

        it('заносит приведённым и показывает, кто из заведённого совпал', async () => {
            const { service, prisma } = setup();
            const r = await service.add('c1', 'u1', { kind: 'PHONE', value: '8 701 123 45 67', name: ' ТОО «Призрак» ', reason: 'взял груз и пропал' });
            expect(prisma.companyBlocklist.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
                companyId: 'c1', kind: 'PHONE', value: '+77011234567', name: 'ТОО «Призрак»', createdById: 'u1',
            }));
            expect(r.matches.map((m) => [m.type, m.name])).toEqual([['COUNTERPARTY', 'ТОО «Призрак»'], ['DRIVER', 'Петров Иван']]);
        });

        it('без причины и с кривым БИН — не заносит', async () => {
            const { service, prisma } = setup();
            await expect(service.add('c1', 'u1', { kind: 'BIN_IIN', value: '12345', reason: 'мошенник' })).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.add('c1', 'u1', { kind: 'PHONE', value: '87011234567', reason: ' ' })).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.companyBlocklist.create).not.toHaveBeenCalled();
        });

        it('повтор — «уже в списке», а не ошибка сервера', async () => {
            const { service, prisma } = setup();
            prisma.companyBlocklist.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
            await expect(service.add('c1', 'u1', { kind: 'PLATE', value: '123ABC02', reason: 'угон' })).rejects.toBeInstanceOf(ConflictException);
        });

        it('снимает только свою запись', async () => {
            const { service, prisma } = setup();
            await service.remove('c1', 'b1');
            expect(prisma.companyBlocklist.deleteMany).toHaveBeenCalledWith({ where: { id: 'b1', companyId: 'c1' } });
        });
    });
});
