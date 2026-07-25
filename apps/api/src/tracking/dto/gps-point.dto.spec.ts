import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendGpsPointDto } from './gps-point.dto';

describe('SendGpsPointDto', () => {
    const validPayload = {
        latitude: 43.238949,
        longitude: 76.889709,
        accuracy: 12.5,
        speed: 60,
        heading: 180,
        recordedAt: '2026-07-25T10:00:00.000Z',
    };

    it('accepts the payload the mobile app actually sends', async () => {
        const dto = plainToInstance(SendGpsPointDto, validPayload);

        expect(await validate(dto)).toHaveLength(0);
    });

    // Expo отдаёт null для accuracy/speed/heading, когда датчик их не знает.
    // Такие точки терять нельзя — координаты в них корректные.
    it('accepts null accuracy, speed and heading', async () => {
        const dto = plainToInstance(SendGpsPointDto, {
            ...validPayload,
            accuracy: null,
            speed: null,
            heading: null,
        });

        expect(await validate(dto)).toHaveLength(0);
    });

    it('accepts a point bound to an order', async () => {
        const dto = plainToInstance(SendGpsPointDto, { ...validPayload, orderId: 'clx0000000000000000000000' });

        expect(await validate(dto)).toHaveLength(0);
    });

    it.each([
        ['latitude', 91],
        ['latitude', -91],
        ['longitude', 181],
        ['longitude', -181],
    ])('rejects out-of-range %s = %s', async (field, value) => {
        const dto = plainToInstance(SendGpsPointDto, { ...validPayload, [field]: value });

        expect(await validate(dto)).not.toHaveLength(0);
    });

    it.each(['latitude', 'longitude', 'recordedAt'])('rejects a missing %s', async (field) => {
        const payload: Record<string, unknown> = { ...validPayload };
        delete payload[field];
        const dto = plainToInstance(SendGpsPointDto, payload);

        expect(await validate(dto)).not.toHaveLength(0);
    });

    it('rejects a non-ISO recordedAt', async () => {
        const dto = plainToInstance(SendGpsPointDto, { ...validPayload, recordedAt: 'вчера' });

        expect(await validate(dto)).not.toHaveLength(0);
    });

});

// Ключевая защита от подмены водителя. Проверяем не сам DTO, а связку
// «DTO + ValidationPipe с настройками из main.ts»: driverId не объявлен в
// схеме, поэтому forbidNonWhitelisted обязан отклонить такой запрос, а не
// пропустить чужой идентификатор дальше в сервис.
describe('SendGpsPointDto + глобальный ValidationPipe', () => {
    const pipe = new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    });
    const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: SendGpsPointDto,
    };

    const validPayload = {
        latitude: 43.238949,
        longitude: 76.889709,
        recordedAt: '2026-07-25T10:00:00.000Z',
    };

    it('rejects an attempt to send driverId in the request body', async () => {
        await expect(
            pipe.transform({ ...validPayload, driverId: 'чужой-водитель' }, metadata),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lets a clean payload through', async () => {
        await expect(pipe.transform(validPayload, metadata)).resolves.toMatchObject(validPayload);
    });
});
