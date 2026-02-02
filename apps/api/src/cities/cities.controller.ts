import { Controller, Get, Post, Body, Param, Delete, Query, Patch } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('cities')
@Controller('cities')
export class CitiesController {
    constructor(private readonly citiesService: CitiesService) { }

    @Post()
    @ApiOperation({ summary: 'Добавить новый город' })
    create(@Body() createCityDto: { name: string; latitude: number; longitude: number; countryId: string; regionId?: string }) {
        return this.citiesService.create(createCityDto);
    }

    @Get('countries')
    getCountries() {
        return this.citiesService.getCountries();
    }

    @Get('regions')
    getRegions(@Query('countryId') countryId: string) {
        return this.citiesService.getRegions(countryId);
    }

    // --- Country Endpoints ---
    @Post('countries')
    createCountry(@Body() dto: { name: string; code: string }) {
        return this.citiesService.createCountry(dto);
    }

    @Patch('countries/:id')
    updateCountry(@Param('id') id: string, @Body() dto: { name?: string; code?: string }) {
        return this.citiesService.updateCountry(id, dto);
    }

    @Delete('countries/:id')
    deleteCountry(@Param('id') id: string) {
        return this.citiesService.deleteCountry(id);
    }

    // --- Region Endpoints ---
    @Post('regions')
    createRegion(@Body() dto: { name: string; countryId: string }) {
        return this.citiesService.createRegion(dto);
    }

    @Patch('regions/:id')
    updateRegion(@Param('id') id: string, @Body() dto: { name?: string }) {
        return this.citiesService.updateRegion(id, dto);
    }

    @Delete('regions/:id')
    deleteRegion(@Param('id') id: string) {
        return this.citiesService.deleteRegion(id);
    }

    @Get()
    @ApiOperation({ summary: 'Получить список всех городов' })
    findAll(
        @Query('search') search?: string,
        @Query('regionId') regionId?: string,
    ) {
        return this.citiesService.findAll(search, regionId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Удалить город' })
    remove(@Param('id') id: string) {
        return this.citiesService.remove(id);
    }
}
