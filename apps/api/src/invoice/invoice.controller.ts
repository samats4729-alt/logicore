import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { UserRole, InvoiceType, InvoiceStatus } from '@prisma/client';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('accounting')
@ApiBearerAuth()
export class InvoiceController {
    constructor(private invoiceService: InvoiceService) {}

    @Post()
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Создать новый счет' })
    async createInvoice(
        @Body() dto: {
            invoiceNumber: string;
            type: InvoiceType;
            date: string;
            dueDate?: string;
            issuerId: string;
            recipientId: string;
            orderIds: string[];
            note?: string;
        },
        @Request() req: any,
    ) {
        return this.invoiceService.createInvoice(req.user.companyId, req.user.id, dto);
    }

    @Get()
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить список счетов компании' })
    async getInvoices(
        @Query('type') type?: InvoiceType,
        @Query('status') status?: InvoiceStatus,
        @Query('counterpartyId') counterpartyId?: string,
        @Request() req?: any,
    ) {
        return this.invoiceService.getInvoices(req.user.companyId, { type, status, counterpartyId });
    }

    @Get('uninvoiced-orders')
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить завершенные рейсы контрагента без счета' })
    async getUninvoicedOrders(
        @Query('type') type: InvoiceType,
        @Query('counterpartyId') counterpartyId: string,
        @Request() req: any,
    ) {
        return this.invoiceService.getUninvoicedOrders(req.user.companyId, type, counterpartyId);
    }

    @Get(':id')
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить детальную информацию о счете' })
    async getInvoiceDetails(@Param('id') id: string, @Request() req: any) {
        return this.invoiceService.getInvoiceDetails(id, req.user.companyId);
    }

    @Put(':id/status')
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Изменить статус счета' })
    async updateInvoiceStatus(
        @Param('id') id: string,
        @Body() dto: { status: InvoiceStatus },
        @Request() req: any,
    ) {
        return this.invoiceService.updateInvoiceStatus(id, req.user.companyId, dto.status, req.user.id);
    }

    @Post(':id/accept-dispute')
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Принять скорректированные цены (согласовать спор)' })
    async acceptDispute(@Param('id') id: string, @Request() req: any) {
        return this.invoiceService.acceptDispute(id, req.user.companyId);
    }

    @Delete(':id')
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Удалить счет (в статусе DRAFT)' })
    async deleteInvoice(@Param('id') id: string, @Request() req: any) {
        return this.invoiceService.deleteInvoice(id, req.user.companyId);
    }
}
