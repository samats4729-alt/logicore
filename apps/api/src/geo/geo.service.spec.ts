import { RedisService } from '../redis/redis.service';
import { GeoService } from './geo.service';

describe('GeoService', () => {
    const originalFetch = global.fetch;
    const originalApiKey = process.env.DGIS_API_KEY;

    afterEach(() => {
        global.fetch = originalFetch;
        if (originalApiKey === undefined) {
            delete process.env.DGIS_API_KEY;
        } else {
            process.env.DGIS_API_KEY = originalApiKey;
        }
        jest.restoreAllMocks();
    });

    it('returns normalized country, region and city metadata from 2GIS', async () => {
        const redis = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
        };
        const service = new GeoService(redis as unknown as RedisService);
        process.env.DGIS_API_KEY = 'test-key';
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({
                result: {
                    items: [{
                        id: 'address-1',
                        full_name: 'Ташкент, улица Амира Темура, 1',
                        locale: 'ru_UZ',
                        point: { lat: 41.311, lon: 69.279 },
                        adm_div: [
                            { id: 'country-uz', type: 'country', name: 'Узбекистан' },
                            { id: 'region-tashkent', type: 'region', name: 'Ташкент' },
                            { id: 'city-tashkent', type: 'city', name: 'Ташкент' },
                        ],
                    }],
                },
            }),
        }) as unknown as typeof fetch;

        const result = await service.suggest('Ташкент, Амира Темура, 1');

        expect(result.items[0].geography).toEqual({
            provider: '2gis',
            placeId: 'address-1',
            country: { code: 'UZ', name: 'Узбекистан', externalId: 'country-uz' },
            region: { name: 'Ташкент', externalId: 'region-tashkent' },
            city: { name: 'Ташкент', externalId: 'city-tashkent' },
        });
    });
});
