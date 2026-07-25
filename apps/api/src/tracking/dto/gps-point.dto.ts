import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { MIN_GPS_RETENTION_DAYS } from '../tracking.service';

/**
 * Точка GPS от водителя.
 *
 * Важно: `driverId` здесь намеренно ОТСУТСТВУЕТ. Он берётся исключительно из
 * JWT-токена в контроллере. Глобальный ValidationPipe настроен с
 * `forbidNonWhitelisted: true`, поэтому попытка передать `driverId` в теле
 * запроса вернёт 400, а не подменит водителя (раньше `...dto` затирал
 * `driverId` из токена — водитель мог писать координаты за любого другого).
 */
export class SendGpsPointDto {
    @ApiProperty({ description: 'Широта' })
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude: number;

    @ApiProperty({ description: 'Долгота' })
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude: number;

    @ApiProperty({ required: false, description: 'Точность, м' })
    @IsOptional()
    @IsNumber()
    accuracy?: number;

    // Expo на части устройств отдаёт -1, когда скорость неизвестна, поэтому
    // нижнюю границу не ставим — сохраняем как есть, чтобы не отбрасывать точку.
    @ApiProperty({ required: false, description: 'Скорость, км/ч' })
    @IsOptional()
    @IsNumber()
    speed?: number;

    @ApiProperty({ required: false, description: 'Направление, градусы' })
    @IsOptional()
    @IsNumber()
    heading?: number;

    @ApiProperty({ required: false, description: 'ID заявки' })
    @IsOptional()
    @IsString()
    orderId?: string;

    @ApiProperty({ description: 'Время фиксации точки на устройстве (ISO)' })
    @IsDateString()
    recordedAt: string;
}

/**
 * Запрос на чистку старых GPS-точек. Глубина хранения ограничена снизу:
 * треки нужны для разбора претензий по доставке, поэтому одним неверным
 * параметром снести историю нельзя.
 */
export class PurgeGpsPointsDto {
    @ApiProperty({ minimum: MIN_GPS_RETENTION_DAYS, description: 'Удалить точки старше этого числа дней' })
    @IsInt()
    @Min(MIN_GPS_RETENTION_DAYS)
    olderThanDays: number;
}
