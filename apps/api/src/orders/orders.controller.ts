import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CreateOrderDto, UpdateStatusDto, AssignDriverDto } from './dto/order.dto';
import { UserRole, OrderStatus } from '@prisma/client';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
    constructor(private ordersService: OrdersService) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Создать заявку на перевозку' })
    async create(@Body() dto: CreateOrderDto, @Request() req: any) {
        return this.ordersService.create({
            ...dto,
            customerId: dto.customerId || req.user.sub,
            pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : undefined,
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
    async findAll(
        @Query('status') status?: OrderStatus,
        @Query('customerId') customerId?: string,
        @Query('driverId') driverId?: string,
    ) {
        return this.ordersService.findAll({ status, customerId, driverId });
    }

    @Get('my')
    @Roles(UserRole.DRIVER)
    @ApiOperation({ summary: 'Мои заявки (для водителя)' })
    async myOrders(@Request() req: any) {
        console.log(`🔍 [DEBUG] GET /orders/my called by user:`, req.user);
        try {
            const result = await this.ordersService.findDriverOrders(req.user.sub);
            console.log(`🔍 [DEBUG] Sending response to client. Items count: ${result.length}`);
            if (result.length > 0) {
                console.log(`🔍 [DEBUG] First item sample:`, JSON.stringify(result[0]).substring(0, 100));
            }
            return result;
        } catch (e) {
            console.error(`❌ [DEBUG] Error in myOrders:`, e);
            throw e;
        }
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить заявку по ID' })
    async findOne(@Param('id') id: string) {
        return this.ordersService.findById(id);
    }

    @Put(':id/assign')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Назначить водителя на заявку' })
    async assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto) {
        return this.ordersService.assignDriver(id, dto.driverId, dto.partnerId);
    }

    @Put(':id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Обновить заявку' })
    async update(@Param('id') id: string, @Body() dto: Partial<CreateOrderDto>) {
        return this.ordersService.update(id, dto);
    }

    @Put(':id/status')
    @ApiOperation({ summary: 'Обновить статус заявки' })
    async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Request() req: any) {
        return this.ordersService.updateStatus(id, dto.status, dto.comment, req.user.sub);
    }

    @Post(':id/problem')
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
    ) {
        return this.ordersService.addDeliveryPoint(id, dto.locationId, dto.notes);
    }
}
