import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GeoService } from './geo.service';

@ApiTags('geo')
@Controller('geo')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GeoController {
    constructor(private geoService: GeoService) { }

    @Get('suggest')
    @ApiOperation({ summary: 'Подсказки адресов (2ГИС через кэширующий прокси)' })
    async suggest(@Query('q') q?: string) {
        return this.geoService.suggest(q || '');
    }

    @Get('reverse')
    @ApiOperation({ summary: 'Адрес по координатам (2ГИС через кэширующий прокси)' })
    async reverse(@Query('lat') lat?: string, @Query('lon') lon?: string) {
        return this.geoService.reverse(parseFloat(lat || ''), parseFloat(lon || ''));
    }
}
