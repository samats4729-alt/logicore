import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('locations')
@Controller('locations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LocationsController {
    constructor(private locationsService: LocationsService) { }

    @Post()
    @ApiOperation({ summary: 'Создать точку/адрес' })
    async create(@Body() dto: any) {
        return this.locationsService.create(dto);
    }

    @Get()
    @ApiOperation({ summary: 'Получить список точек' })
    @ApiQuery({ name: 'search', required: false })
    async findAll(@Query('search') search?: string) {
        return this.locationsService.findAll(search);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить точку по ID' })
    async findOne(@Param('id') id: string) {
        return this.locationsService.findById(id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить точку' })
    async update(@Param('id') id: string, @Body() dto: any) {
        return this.locationsService.update(id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Удалить точку' })
    async delete(@Param('id') id: string) {
        return this.locationsService.delete(id);
    }
}
