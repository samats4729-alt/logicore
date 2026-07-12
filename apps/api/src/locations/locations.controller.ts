import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { AuditService } from '../audit/audit.service';

@ApiTags('locations')
@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LocationsController {
    constructor(private locationsService: LocationsService, private auditService: AuditService) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Создать точку/адрес' })
    async create(@Body() dto: CreateLocationDto, @Request() req: any) {
        return this.locationsService.create({
            ...dto,
            createdById: req.user.sub,
            companyId: dto.companyId || req.user.companyId,
        }, req.user);
    }

    @Get()
    @ApiOperation({ summary: 'Получить список точек' })
    @ApiQuery({ name: 'search', required: false })
    async findAll(@Query('search') search: string | undefined, @Request() req: any) {
        const companyId = req.user.role === 'ADMIN' ? undefined : req.user.companyId;
        return this.locationsService.findAll(search, companyId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить точку по ID' })
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.locationsService.findById(id, req.user);
    }

    @Put(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Обновить точку' })
    async update(@Param('id') id: string, @Body() dto: UpdateLocationDto, @Request() req: any) {
        return this.locationsService.update(id, dto, req.user);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Удалить точку' })
    async delete(@Param('id') id: string, @Request() req: any) {
        const result = await this.locationsService.delete(id, req.user);
        await this.auditService.log({
            companyId: req.user.companyId, user: req.user, action: 'DELETE', entity: 'location',
            entityId: id, entityLabel: `Адрес «${(result as any)?.name || id}»`,
        });
        return result;
    }
}