import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, GoneException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { UserRole } from '@prisma/client';
import {
    CreateInvoiceDto,
    GetInvoicesQueryDto,
    GetUninvoicedOrdersQueryDto,
    SendInvoiceEmailDto,
    UpdateInvoiceStatusDto,
} from './dto/invoice.dto';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('accounting')
@ApiBearerAuth()
export class InvoiceController {
    constructor(private invoiceService: InvoiceService) {}

    /**
     * Создание счёта здесь закрыто.
     *
     * Счета живут в разделе «Бухгалтерия» (AccountingDocument): там нумерация,
     * НДС, акты и сверки. Этот раздел — предыдущее поколение, из интерфейса к
     * нему давно никто не обращается, но эндпоинт оставался открытым и мог
     * положить запись мимо основного учёта. Одна и та же операция в двух
     * местах — это разошедшиеся отчёты и вопрос «какой цифре верить».
     *
     * Чтение и правку оставляем: старые счета должны оставаться видимыми,
     * пока владелец не решит, что с ними делать.
     */
    @Post()
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Закрыто: счета выставляются в разделе «Бухгалтерия»' })
    async createInvoice(
        @Body() _dto: CreateInvoiceDto,
        @Request() _req: any,
    ) {
        throw new GoneException(
            'Счета теперь выставляются в разделе «Бухгалтерия». Прежний журнал остаётся доступным для просмотра.',
        );
    }

    @Get()
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить список счетов компании' })
    async getInvoices(
        @Query() query: GetInvoicesQueryDto,
        @Request() req: any,
    ) {
        return this.invoiceService.getInvoices(req.user.companyId, query);
    }

    @Get('uninvoiced-orders')
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить рейсы контрагента без счета (завершённые, опц. в работе)' })
    async getUninvoicedOrders(
        @Query() query: GetUninvoicedOrdersQueryDto,
        @Request() req: any,
    ) {
        return this.invoiceService.getUninvoicedOrders(
            req.user.companyId,
            query.type,
            query.counterpartyId,
            query.includeInProgress === 'true',
        );
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
        @Body() dto: UpdateInvoiceStatusDto,
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

    @Post(':id/send-email')
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Отправить счёт контрагенту по email' })
    async sendEmail(@Param('id') id: string, @Body() dto: SendInvoiceEmailDto, @Request() req: any) {
        return this.invoiceService.sendInvoiceEmail(id, req.user.companyId, dto?.email);
    }

    @Delete(':id')
    @Roles(UserRole.ACCOUNTANT, UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Удалить счет (в статусе DRAFT)' })
    async deleteInvoice(@Param('id') id: string, @Request() req: any) {
        return this.invoiceService.deleteInvoice(id, req.user.companyId);
    }
}
