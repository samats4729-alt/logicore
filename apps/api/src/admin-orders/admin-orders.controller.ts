import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AdminOrdersService } from './admin-orders.service';
import { OrderForceDeleteService } from './order-force-delete.service';
import { AuditService } from '../audit/audit.service';

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
    constructor(
        private readonly service: AdminOrdersService,
        private readonly forceDelete: OrderForceDeleteService,
        private readonly audit: AuditService,
    ) {}

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

    @Post(':id/force-delete')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Удалить тестовую или ошибочную заявку вместе с её деньгами (подтверждение — номер заявки)' })
    async remove(@Param('id') id: string, @Body() body: { confirm?: string }, @Request() req: any) {
        const r = await this.forceDelete.delete(id, body?.confirm ?? '');
        await this.audit.log({
            companyId: req.user.companyId ?? null, user: req.user, action: 'DELETE', entity: 'order', entityId: id,
            entityLabel: `Заявка №${r.orderNumber} удалена администратором вместе с деньгами`,
            details: { ...r },
        });
        return r;
    }
}
