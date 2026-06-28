import { Controller, Get, Post, Body, Param, Delete, Query, Patch, UseGuards } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('cities')
@Controller('cities')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CitiesController {
    constructor(private readonly citiesService: CitiesService) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
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
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    createCountry(@Body() dto: { name: string; code: string }) {
        return this.citiesService.createCountry(dto);
    }

    @Patch('countries/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    updateCountry(@Param('id') id: string, @Body() dto: { name?: string; code?: string }) {
        return this.citiesService.updateCountry(id, dto);
    }

    @Delete('countries/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    deleteCountry(@Param('id') id: string) {
        return this.citiesService.deleteCountry(id);
    }

    // --- Region Endpoints ---
    @Post('regions')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    createRegion(@Body() dto: { name: string; countryId: string }) {
        return this.citiesService.createRegion(dto);
    }

    @Patch('regions/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    updateRegion(@Param('id') id: string, @Body() dto: { name?: string }) {
        return this.citiesService.updateRegion(id, dto);
    }

    @Delete('regions/:id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
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
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Удалить город' })
    remove(@Param('id') id: string) {
        return this.citiesService.remove(id);
    }
}
