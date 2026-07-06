import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { PowerOfAttorneyService } from './power-of-attorney.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CreateOrderDto, UpdateStatusDto, AssignDriverDto } from './dto/order.dto';
import { UserRole, OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
    constructor(
        private ordersService: OrdersService,
        private poaService: PowerOfAttorneyService,
        private emailService: EmailService,
        private prisma: PrismaService,
    ) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Создать заявку на перевозку' })
    async create(@Body() dto: CreateOrderDto, @Request() req: any) {
        return this.ordersService.create({
            ...dto,
            customerId: dto.customerId || req.user.sub,
            responsibleManagerId: req.user.sub,
            customerPaymentDate: dto.customerPaymentDate ? new Date(dto.customerPaymentDate) : undefined,
            driverPaymentDate: dto.driverPaymentDate ? new Date(dto.driverPaymentDate) : undefined,
        });
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
    @ApiOperation({ summary: 'Мои заявки (для водителя)' })
    async myOrders(@Request() req: any) {
        return this.ordersService.findDriverOrders(req.user.sub);
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
        return this.ordersService.update(id, {
            ...dto,
            customerPaymentDate: dto.customerPaymentDate ? new Date(dto.customerPaymentDate) : undefined,
            driverPaymentDate: dto.driverPaymentDate ? new Date(dto.driverPaymentDate) : undefined,
        }, {
            id: req.user.sub,
            role: req.user.role,
            companyId: req.user.companyId,
        });
    }

    @Put(':id/status')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.DRIVER)
    @ApiOperation({ summary: 'Обновить статус заявки' })
    async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Request() req: any) {
        return this.ordersService.updateStatus(id, dto.status, dto.comment, req.user.sub, req.user.companyId, req.user.role);
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