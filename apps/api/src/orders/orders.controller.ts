import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { PowerOfAttorneyService } from './power-of-attorney.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { CreateOrderDto, UpdateStatusDto, AssignDriverDto } from './dto/order.dto';
import { UserRole, OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('orders')
@ApiBearerAuth()
export class OrdersController {
    constructor(
        private ordersService: OrdersService,
        private poaService: PowerOfAttorneyService,
        private emailService: EmailService,
        private prisma: PrismaService,
        private billingService: BillingService,
        private auditService: AuditService,
    ) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Создать заявку на перевозку' })
    async create(@Body() dto: CreateOrderDto, @Request() req: any) {
        if (req.user.companyId) {
            await this.billingService.assertOrderLimit(req.user.companyId);
        }

        const { responsibleUserId, ...orderDto } = dto as any;
        const order = await this.ordersService.create({
            ...orderDto,
            customerId: dto.customerId || req.user.sub,
            responsibleManagerId: req.user.sub,
            ownerCompanyId: req.user.companyId || undefined,
            customerPaymentDate: dto.customerPaymentDate ? new Date(dto.customerPaymentDate) : undefined,
            driverPaymentDate: dto.driverPaymentDate ? new Date(dto.driverPaymentDate) : undefined,
        });

        // Ответственный от компании создателя: по умолчанию — сам создатель;
        // можно назначить другого менеджера (помощник вбивает заявки) или
        // "NONE" — не назначать, тогда заявку видят все менеджеры («кто возьмёт»)
        if (req.user.companyId) {
            if (responsibleUserId === 'NONE') {
                // без ответственного
            } else if (responsibleUserId && responsibleUserId !== req.user.sub) {
                await this.ordersService.reassignResponsible(order.id, req.user.companyId, responsibleUserId);
            } else {
                await this.ordersService.setCompanyResponsible(order.id, req.user.companyId, req.user.sub, true);
            }
        }

        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'CREATE',
            entity: 'order',
            entityId: order.id,
            entityLabel: `Заявка №${order.orderNumber}`,
            details: { customerPrice: dto.customerPrice ?? null, driverCost: dto.driverCost ?? null },
        });

        return order;
    }

    @Get('numbering-settings')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Настройка нумерации заявок' })
    async getNumberingSettings(@Request() req: any) {
        return this.ordersService.getNumberingSettings(req.user.companyId);
    }

    @Put('numbering-settings')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Сохранить настройку нумерации заявок' })
    async updateNumberingSettings(@Request() req: any, @Body() body: { prefix?: string; padding?: number; nextNumber?: number }) {
        return this.ordersService.updateNumberingSettings(req.user.companyId, body);
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить список заявок' })
    @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
    @ApiQuery({ name: 'customerId', required: false })
    @ApiQuery({ name: 'driverId', required: false })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async findAll(
        @Query('status') status?: OrderStatus,
        @Query('customerId') customerId?: string,
        @Query('driverId') driverId?: string,
        @Query() pagination?: PaginationQueryDto,
        @Request() req?: any,
    ) {
        const companyId = req?.user?.role === 'ADMIN' ? undefined : req?.user?.companyId;
        return this.ordersService.findAll({ status, customerId, driverId, companyId }, pagination);
    }

    @Get('my')
    @Roles(UserRole.DRIVER)
    @ApiOperation({ summary: 'Мои заявки (для водителя); history=1 — включая завершённые' })
    async myOrders(@Request() req: any, @Query('history') history?: string) {
        return this.ordersService.findDriverOrders(req.user.sub, history === '1');
    }

    @Get(':id/power-of-attorney')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.DRIVER)
    @ApiOperation({ summary: 'Скачать доверенность на водителя (PDF)' })
    async downloadPowerOfAttorney(
        @Param('id') id: string,
        @Request() req: any,
        @Res() res: Response,
    ) {
        const pdfBuffer = await this.poaService.generatePdf(id, req.user.companyId);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="POA_${id}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.end(pdfBuffer);
    }

    @Post(':id/share-power-of-attorney')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отправить доверенность по email получателям' })
    async sharePowerOfAttorney(
        @Param('id') id: string,
        @Body() body: { emails: string[] },
        @Request() req: any,
    ) {
        if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
            throw new BadRequestException('Не указаны email-адреса для рассылки');
        }

        const order = await this.ordersService.findById(id, {
            userId: req.user.sub,
            role: req.user.role,
            companyId: req.user.companyId,
        });
        if (!order) {
            throw new NotFoundException('Заявка не найдена');
        }

        // Fetch sender's company name
        const company = req.user.companyId
            ? await this.prisma.company.findUnique({ where: { id: req.user.companyId }, select: { name: true } })
            : null;
        const senderCompanyName = company?.name || 'LogiCore';

        // Generate the PDF buffer
        const pdfBuffer = await this.poaService.generatePdf(id, req.user.companyId);

        // Собираем ключевые данные водителя для отображения в письме
        const driver = (order as any).driver;
        const routePoints = (order as any).routePoints || [];
        const pickupPoint = routePoints.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
        const deliveryPoint = routePoints.find((p: any) => p.pointType === 'DELIVERY');
        const pickupCity = pickupPoint?.location?.city || pickupPoint?.location?.address || '';
        const deliveryCity = deliveryPoint?.location?.city || deliveryPoint?.location?.address || '';

        const driverInfo = {
            fullName: driver
                ? `${driver.lastName || ''} ${driver.firstName || ''} ${driver.middleName || ''}`.trim()
                : ((order as any).assignedDriverName || undefined),
            vehicleModel: driver?.vehicleModel || undefined,
            vehiclePlate: driver?.vehiclePlate || (order as any).assignedDriverPlate || undefined,
            phone: driver?.phone || (order as any).assignedDriverPhone || undefined,
            route: (pickupCity && deliveryCity) ? `${pickupCity} → ${deliveryCity}` : undefined,
        };

        // Send emails in parallel
        await Promise.all(
            body.emails.map(email =>
                this.emailService.sendPowerOfAttorneyEmail(email, order.orderNumber, senderCompanyName, pdfBuffer, driverInfo)
            )
        );

        return { success: true, message: 'Доверенность успешно отправлена на указанные адреса' };
    }

    @Get(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.DRIVER)
    @ApiOperation({ summary: 'Получить заявку по ID' })
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.findById(id, {
            userId: req.user.sub,
            role: req.user.role,
            companyId: req.user.companyId,
        });
    }

    @Put(':id/assign')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Назначить водителя на заявку' })
    async assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto) {
        return this.ordersService.assignDriver(id, dto.driverId, dto.partnerId, {
            assignedDriverName: dto.assignedDriverName,
            assignedDriverPhone: dto.assignedDriverPhone,
            assignedDriverPlate: dto.assignedDriverPlate,
            assignedDriverTrailer: dto.assignedDriverTrailer,
        });
    }

    @Put(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить заявку' })
    async update(@Param('id') id: string, @Body() dto: Partial<CreateOrderDto>, @Request() req: any) {
        const updated = await this.ordersService.update(id, {
            ...dto,
            customerPaymentDate: dto.customerPaymentDate ? new Date(dto.customerPaymentDate) : undefined,
            driverPaymentDate: dto.driverPaymentDate ? new Date(dto.driverPaymentDate) : undefined,
        }, {
            id: req.user.sub,
            role: req.user.role,
            companyId: req.user.companyId,
        });

        // Журналируем денежные поля — самое частое поле споров
        const moneyChanges: Record<string, any> = {};
        if (dto.customerPrice !== undefined) moneyChanges.customerPrice = dto.customerPrice;
        if (dto.driverCost !== undefined) moneyChanges.driverCost = dto.driverCost;
        if ((dto as any).subForwarderPrice !== undefined) moneyChanges.subForwarderPrice = (dto as any).subForwarderPrice;
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order',
            entityId: id,
            entityLabel: `Заявка №${(updated as any)?.orderNumber || id}`,
            details: Object.keys(moneyChanges).length ? moneyChanges : null,
        });

        return updated;
    }

    @Put(':id/status')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.DRIVER)
    @ApiOperation({ summary: 'Обновить статус заявки' })
    async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Request() req: any) {
        const result = await this.ordersService.updateStatus(id, dto.status, dto.comment, req.user.sub, req.user.companyId, req.user.role);

        // В журнал — только критичные переходы (отмена/проблема); рутинные статусы пишет OrderStatusHistory
        if (dto.status === 'CANCELLED' || dto.status === 'PROBLEM') {
            await this.auditService.log({
                companyId: req.user.companyId,
                user: req.user,
                action: 'STATUS',
                entity: 'order',
                entityId: id,
                entityLabel: `Заявка №${(result as any)?.orderNumber || id}`,
                details: { status: dto.status, comment: dto.comment ?? null },
            });
        }

        return result;
    }

    @Put(':id/confirm-completion')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Подтвердить завершение рейса' })
    async confirmCompletion(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.confirmCompletion(id, req.user.companyId, req.user.sub);
    }

    @Put(':id/reject-completion')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отклонить завершение рейса' })
    async rejectCompletion(
        @Param('id') id: string,
        @Body() body: { reason?: string },
        @Request() req: any
    ) {
        return this.ordersService.rejectCompletion(id, req.user.companyId, req.user.sub, body.reason);
    }

    @Put(':id/cancel-completion')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отменить запрос на завершение рейса' })
    async cancelCompletionRequest(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.cancelCompletionRequest(id, req.user.companyId, req.user.sub);
    }

    @Post(':id/problem')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.DRIVER)
    @ApiOperation({ summary: 'Сообщить о проблеме' })
    async reportProblem(
        @Param('id') id: string,
        @Body() dto: { description: string },
        @Request() req: any
    ) {
        return this.ordersService.reportProblem(id, dto.description, req.user.sub);
    }

    @Post(':id/delivery-point')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Добавить точку выгрузки' })
    async addDeliveryPoint(
        @Param('id') id: string,
        @Body() dto: { locationId: string; notes?: string },
        @Request() req: any,
    ) {
        return this.ordersService.addDeliveryPoint(id, dto.locationId, dto.notes, req.user);
    }
}