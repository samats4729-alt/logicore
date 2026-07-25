import { PrismaService } from '../prisma/prisma.service';
import { CitiesService } from './cities.service';

describe('CitiesService.importFromProvider', () => {
    const createTransactionClient = () => ({
        country: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        region: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        city: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    });

    it('creates a foreign country, region and city selected in 2GIS', async () => {
        const tx = createTransactionClient();
        const country = { id: 'country-uz', name: 'Узбекистан', code: 'UZ', externalId: 'uz' };
        const region = { id: 'region-tashkent', name: 'Ташкент', externalId: 'region-1' };
        const city = {
            id: 'city-tashkent',
            name: 'Ташкент',
            latitude: 41.311,
            longitude: 69.279,
            externalId: 'city-1',
        };
        tx.country.findFirst.mockResolvedValue(null);
        tx.region.findFirst.mockResolvedValue(null);
        tx.city.findFirst.mockResolvedValue(null);
        tx.country.create.mockResolvedValue(country);
        tx.region.create.mockResolvedValue(region);
        tx.city.create.mockResolvedValue(city);

        const prisma = {
            $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
        };
        const service = new CitiesService(prisma as unknown as PrismaService);

        const result = await service.importFromProvider({
            provider: '2gis',
            country: { name: 'Узбекистан', code: 'uz', externalId: 'uz' },
            region: { name: 'Ташкент', externalId: 'region-1' },
            city: { name: 'Ташкент', externalId: 'city-1' },
            latitude: 41.311,
            longitude: 69.279,
        });

        expect(tx.country.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ code: 'UZ', externalProvider: '2gis' }),
        });
        expect(tx.region.create).toHaveBeenCalledTimes(1);
        expect(tx.city.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ country, region, city });
    });

    it('reuses existing records and only attaches the missing provider ID', async () => {
        const tx = createTransactionClient();
        const country = { id: 'country-kz', name: 'Казахстан', code: 'KZ', externalId: 'kz' };
        const region = { id: 'region-almaty', name: 'Алматы', externalId: 'region-kz-1' };
        const cityWithoutProvider = {
            id: 'city-almaty',
            name: 'Алматы',
            latitude: 43.238,
            longitude: 76.945,
            externalId: null,
        };
        const cityWithProvider = { ...cityWithoutProvider, externalId: 'city-kz-1' };
        tx.country.findFirst.mockResolvedValue(country);
        tx.region.findFirst.mockResolvedValue(region);
        tx.city.findFirst.mockResolvedValue(cityWithoutProvider);
        tx.city.update.mockResolvedValue(cityWithProvider);

        const prisma = {
            $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
        };
        const service = new CitiesService(prisma as unknown as PrismaService);

        const result = await service.importFromProvider({
            provider: '2gis',
            country: { name: 'Казахстан', code: 'KZ', externalId: 'kz' },
            region: { name: 'Алматы', externalId: 'region-kz-1' },
            city: { name: 'Алматы', externalId: 'city-kz-1' },
            latitude: 43.2,
            longitude: 76.9,
        });

        expect(tx.country.create).not.toHaveBeenCalled();
        expect(tx.region.create).not.toHaveBeenCalled();
        expect(tx.city.create).not.toHaveBeenCalled();
        expect(tx.city.update).toHaveBeenCalledWith({
            where: { id: 'city-almaty' },
            data: { externalProvider: '2gis', externalId: 'city-kz-1' },
        });
        expect(result.city).toEqual(cityWithProvider);
    });
});
