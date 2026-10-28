import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AdminOrdersService } from './admin-orders.service';

/**
 * Заявки в админке платформы (владелец, 28.10.2026): поиск по всем
 * компаниям и разбор одной заявки — данные, деньги, почему её нельзя
 * отменить или удалить и что для этого сделать. Только администратор.
 * Отмена и удаление — общими адресами заявки (`PUT /orders/:id/status`,
 * `DELETE /orders/:id`): администратор там уже допущен.
 */
@ApiTags('admin-orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminOrdersController {
    constructor(private readonly service: AdminOrdersService) {}

    @Get()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Поиск заявок по всей платформе: номер, компании, водитель, госномер, город, груз' })
    search(@Query('search') search?: string, @Query('limit') limit?: string) {
        return this.service.search(search, Number(limit) || 50);
    }

    @Get(':id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Разбор заявки: данные, деньги, что мешает отменить или удалить' })
    details(@Param('id') id: string) {
        return this.service.details(id);
    }
}
