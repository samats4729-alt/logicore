import { Controller, Get, Post, Put, Delete, Body, Param, Res, UseGuards, UseInterceptors, UploadedFile, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CompanyService } from './company.service';
import { OrdersService } from '../orders/orders.service';
import { CompanyDriversService } from './services/company-drivers.service';
import { S3Service } from '../s3/s3.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CreateCompanyUserDto, UpdateCompanyProfileDto, CreateDriverDto, UpdateDriverDto, CreateDepartmentDto, UpdateDepartmentDto, AssignUserDepartmentDto, CreateInvitationDto, GetCompanyUsersQueryDto, CreateVehicleDto, UpdateVehicleDto } from './dto/company.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AssignDriverDto } from '../orders/dto/order.dto';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('company')
@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CompanyController {
    constructor(
        private companyService: CompanyService,
        private ordersService: OrdersService,
        private companyDriversService: CompanyDriversService,
        private s3Service: S3Service,
    ) { }

    // ==================== Уведомления ====================

    @Get('notifications')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить счётчики уведомлений' })
    async getNotifications(@Request() req: any) {
        return this.companyService.getNotifications(req.user.companyId);
    }

    // ==================== Пользователи компании ====================

    @Get('users')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить пользователей своей компании' })
    async getCompanyUsers(@Request() req: any, @Query() query: GetCompanyUsersQueryDto) {
        return this.companyService.getCompanyUsers(req.user.companyId, query);
    }

    @Post('users')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Создать пользователя в своей компании' })
    async createCompanyUser(@Request() req: any, @Body() dto: CreateCompanyUserDto) {
        return this.companyService.createCompanyUser(req.user.companyId, dto);
    }

    @Put('users/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить пользователя компании' })
    async updateCompanyUser(
        @Request() req: any,
        @Param('id') userId: string,
        @Body() dto: Partial<CreateCompanyUserDto>,
    ) {
        return this.companyService.updateCompanyUser(req.user.companyId, userId, dto);
    }

    @Put('users/:id/permissions')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить права пользователя' })
    async updateUserPermissions(
        @Request() req: any,
        @Param('id') userId: string,
        @Body() dto: { permissions: string[] },
    ) {
        return this.companyService.updateUserPermissions(req.user.companyId, userId, dto.permissions);
    }

    @Delete('users/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Деактивировать пользователя компании' })
    async deleteCompanyUser(@Request() req: any, @Param('id') userId: string) {
        return this.companyService.deactivateCompanyUser(req.user.companyId, userId);
    }

    // ==================== Приглашения ====================

    @Get('invitations')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить список активных приглашений' })
    async getInvitations(@Request() req: any) {
        return this.companyService.getInvitations(req.user.companyId);
    }

    @Post('invitations')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Создать приглашение для нового сотрудника' })
    async createInvitation(
        @Request() req: any,
        @Body() dto: CreateInvitationDto,
    ) {
        return this.companyService.createInvitation(req.user.companyId, dto.email, dto.role, dto.permissions, dto.departmentId, dto.position);
    }

    @Delete('invitations/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отменить приглашение' })
    async cancelInvitation(@Request() req: any, @Param('id') invitationId: string) {
        return this.companyService.cancelInvitation(req.user.companyId, invitationId);
    }

    // ==================== Заявки компании ====================

    @Get('orders')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER, UserRole.FORWARDER, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Получить заявки своей компании' })
    async getCompanyOrders(@Request() req: any, @Query() query: PaginationQueryDto & { type?: string; mine?: string }) {
        return this.companyService.getCompanyOrders(req.user.companyId, query, req.user.sub);
    }

    // ==================== Профиль компании ====================

    @Get('profile')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить профиль компании' })
    async getCompanyProfile(@Request() req: any) {
        return this.companyService.getCompanyProfile(req.user.companyId);
    }

    @Get('profile-status')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Проверить заполненность профиля компании' })
    async getProfileStatus(@Request() req: any) {
        const company = await this.companyService.getCompanyProfile(req.user.companyId);
        const requiredFields = ['name', 'bin', 'address', 'directorName', 'bankAccount', 'bankName', 'bankBic', 'kbe'];
        const missing = requiredFields.filter(f => !(company as Record<string, any>)[f]);
        return {
            isComplete: missing.length === 0,
            missingFields: missing,
        };
    }

    @Put('profile')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить профиль компании' })
    async updateCompanyProfile(@Request() req: any, @Body() dto: UpdateCompanyProfileDto) {
        return this.companyService.updateCompanyProfile(req.user.companyId, dto);
    }

    // ==================== Печать компании ====================

    @Post('stamp')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @UseInterceptors(FileInterceptor('stamp', {
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
        fileFilter: (req, file, cb) => {
            if (!file.mimetype.match(/^image\/(png|jpeg|jpg)$/)) {
                cb(new Error('Только PNG/JPG файлы'), false);
            } else {
                cb(null, true);
            }
        },
    }))
    @ApiOperation({ summary: 'Загрузить печать компании (PNG)' })
    @ApiConsumes('multipart/form-data')
    async uploadStamp(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new Error('Файл не загружен');
        }
        return this.companyService.uploadStamp(req.user.companyId, file);
    }

    @Get('stamp')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER)
    @ApiOperation({ summary: 'Получить печать компании' })
    async getStamp(@Request() req: any, @Res() res: Response) {
        const stampPath = await this.companyService.getStampPath(req.user.companyId);
        if (!stampPath) {
            return res.status(404).json({ message: 'Печать не загружена' });
        }

        if (this.s3Service.isS3Enabled()) {
            try {
                const { stream, mimeType } = await this.s3Service.downloadFile(stampPath);
                res.setHeader('Content-Type', mimeType || 'image/png');
                return stream.pipe(res);
            } catch (error) {
                // Fallback to local file if S3 download fails (legacy local files support)
                const absolutePath = path.join(process.cwd(), stampPath);
                if (fs.existsSync(absolutePath)) {
                    return res.sendFile(absolutePath);
                }
                return res.status(404).json({ message: 'Файл не найден в S3 и локально' });
            }
        } else {
            const absolutePath = path.join(process.cwd(), stampPath);
            if (!fs.existsSync(absolutePath)) {
                return res.status(404).json({ message: 'Файл не найден' });
            }
            return res.sendFile(absolutePath);
        }
    }

    // ==================== Подпись руководителя ====================

    @Post('signature')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @UseInterceptors(FileInterceptor('signature', {
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
        fileFilter: (req, file, cb) => {
            if (!file.mimetype.match(/^image\/(png|jpeg|jpg)$/)) {
                cb(new Error('Только PNG/JPG файлы'), false);
            } else {
                cb(null, true);
            }
        },
    }))
    @ApiOperation({ summary: 'Загрузить подпись руководителя (PNG)' })
    @ApiConsumes('multipart/form-data')
    async uploadSignature(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new Error('Файл не загружен');
        }
        return this.companyService.uploadSignature(req.user.companyId, file);
    }

    @Get('signature')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER)
    @ApiOperation({ summary: 'Получить подпись руководителя' })
    async getSignature(@Request() req: any, @Res() res: Response) {
        const signaturePath = await this.companyService.getSignaturePath(req.user.companyId);
        if (!signaturePath) {
            return res.status(404).json({ message: 'Подпись не загружена' });
        }

        if (this.s3Service.isS3Enabled()) {
            try {
                const { stream, mimeType } = await this.s3Service.downloadFile(signaturePath);
                res.setHeader('Content-Type', mimeType || 'image/png');
                return stream.pipe(res);
            } catch (error) {
                // Fallback to local file if S3 download fails (legacy local files support)
                const absolutePath = path.join(process.cwd(), signaturePath);
                if (fs.existsSync(absolutePath)) {
                    return res.sendFile(absolutePath);
                }
                return res.status(404).json({ message: 'Файл не найден в S3 и локально' });
            }
        } else {
            const absolutePath = path.join(process.cwd(), signaturePath);
            if (!fs.existsSync(absolutePath)) {
                return res.status(404).json({ message: 'Файл не найден' });
            }
            return res.sendFile(absolutePath);
        }
    }

    // ==================== Экспедиторы ====================

    @Get('forwarders')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить список экспедиторов для выбора' })
    async getForwarders() {
        return this.companyService.getForwarders();
    }

    // ==================== Действия с заявками (экспедирование/субподряд) ====================

    @Put('orders/:id/status')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить статус заявки' })
    async updateOrderStatus(
        @Param('id') id: string,
        @Body() dto: { status: string; comment?: string },
        @Request() req: any
    ) {
        return this.ordersService.updateStatus(id, dto.status as any, dto.comment, req.user.sub, req.user.companyId);
    }

    @Put('orders/:id/confirm-completion')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Подтвердить завершение рейса' })
    async confirmOrderStatusCompletion(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.confirmCompletion(id, req.user.companyId, req.user.sub);
    }

    @Put('orders/:id/reject-completion')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отклонить завершение рейса' })
    async rejectOrderStatusCompletion(
        @Param('id') id: string,
        @Body() body: { reason?: string },
        @Request() req: any
    ) {
        return this.ordersService.rejectCompletion(id, req.user.companyId, req.user.sub, body.reason);
    }

    @Put('orders/:id/cancel-completion')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отменить запрос на завершение рейса' })
    async cancelOrderStatusCompletionRequest(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.cancelCompletionRequest(id, req.user.companyId, req.user.sub);
    }

    @Put('orders/:id/accept')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Принять заявку в работу' })
    async acceptOrder(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.acceptOrder(id, req.user.companyId);
    }

    @Put('orders/:id/reject')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отклонить заявку' })
    async rejectOrder(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.rejectOrder(id, req.user.companyId);
    }

    @Put('orders/:id/take')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Взять заявку в работу с биржи' })
    async takeOrder(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.takeOrder(id, req.user.companyId);
    }

    @Put('orders/:id/assign-driver')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Назначить водителя на заявку' })
    async assignDriver(
        @Param('id') id: string,
        @Body() dto: AssignDriverDto,
    ) {
        return this.ordersService.assignDriver(id, dto.driverId, dto.partnerId, {
            assignedDriverName: dto.assignedDriverName,
            assignedDriverPhone: dto.assignedDriverPhone,
            assignedDriverPlate: dto.assignedDriverPlate,
            assignedDriverTrailer: dto.assignedDriverTrailer,
        });
    }

    @Put('orders/:id/assign-forwarder')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Назначить партнера экспедитором' })
    async assignForwarder(
        @Param('id') id: string,
        @Body() dto: { partnerId: string; price: number },
        @Request() req: any
    ) {
        return this.ordersService.assignForwarder(id, req.user.companyId, dto.partnerId, dto.price);
    }

    // ==================== Водители компании ====================

    @Get('drivers')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Получить список водителей' })
    async getDrivers(
        @Request() req: any,
        @Query('companyId') companyIdQuery?: string,
        @Query('partnerId') partnerIdQuery?: string,
    ) {
        const targetCompanyId = companyIdQuery || partnerIdQuery;
        return this.companyDriversService.getDriversFiltered(req.user.companyId, targetCompanyId);
    }

    @Post('drivers')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Создать водителя в своей компании' })
    async createDriver(@Request() req: any, @Body() dto: CreateDriverDto) {
        const { companyId, ...restDto } = dto;
        const createData = {
            ...restDto,
            docIssuedAt: dto.docIssuedAt ? new Date(dto.docIssuedAt) : undefined,
            docExpiresAt: dto.docExpiresAt ? new Date(dto.docExpiresAt) : undefined,
        };
        const targetCompanyId = companyId || req.user.companyId;
        return this.companyDriversService.createDriver(targetCompanyId, createData);
    }

    @Put('drivers/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить данные водителя' })
    async updateDriver(
        @Request() req: any,
        @Param('id') driverId: string,
        @Body() dto: UpdateDriverDto,
    ) {
        const updateData = {
            ...dto,
            docIssuedAt: dto.docIssuedAt ? new Date(dto.docIssuedAt) : undefined,
            docExpiresAt: dto.docExpiresAt ? new Date(dto.docExpiresAt) : undefined,
        };
        return this.companyDriversService.updateDriver(driverId, req.user.companyId, updateData);
    }

    @Delete('drivers/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Деактивировать водителя' })
    async deleteDriver(@Request() req: any, @Param('id') driverId: string) {
        return this.companyDriversService.deactivateDriver(driverId, req.user.companyId);
    }

    // ==================== Отделы компании (Иерархия) ====================

    @Get('departments')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить дерево отделов и сотрудников' })
    async getDepartments(@Request() req: any) {
        return this.companyService.getDepartments(req.user.companyId);
    }

    @Post('departments')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Создать новый отдел' })
    async createDepartment(@Request() req: any, @Body() dto: CreateDepartmentDto) {
        return this.companyService.createDepartment(req.user.companyId, dto.name, dto.parentDepartmentId, dto.icon);
    }

    @Put('departments/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить название отдела' })
    async updateDepartment(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: UpdateDepartmentDto,
    ) {
        return this.companyService.updateDepartment(req.user.companyId, id, dto.name, dto.icon);
    }

    @Delete('departments/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Удалить отдел' })
    async deleteDepartment(@Request() req: any, @Param('id') id: string) {
        return this.companyService.deleteDepartment(req.user.companyId, id);
    }

    @Put('departments/users/assign')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Привязать/отвязать сотрудника к отделу' })
    async assignUserToDepartment(@Request() req: any, @Body() dto: AssignUserDepartmentDto) {
        return this.companyService.assignUserToDepartment(req.user.companyId, dto.userId, dto.departmentId ?? null);
    }

    // ==================== Транспорт компании (Автопарк) ====================

    @Get('vehicles')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Получить список транспорта компании' })
    async getVehicles(@Request() req: any) {
        return this.companyService.getVehicles(req.user.companyId);
    }

    @Post('vehicles')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Создать новый транспорт' })
    async createVehicle(@Request() req: any, @Body() dto: CreateVehicleDto) {
        return this.companyService.createVehicle(req.user.companyId, dto);
    }

    @Put('vehicles/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить данные транспорта' })
    async updateVehicle(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: UpdateVehicleDto,
    ) {
        return this.companyService.updateVehicle(req.user.companyId, id, dto);
    }

    @Delete('vehicles/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Удалить транспорт' })
    async deleteVehicle(@Request() req: any, @Param('id') id: string) {
        return this.companyService.deleteVehicle(req.user.companyId, id);
    }

    // ==================== Мультикомпания ====================

    @Get('my-companies')
    @ApiOperation({ summary: 'Получить все организации пользователя' })
    async getMyCompanies(@Request() req: any) {
        return this.companyService.getMyCompanies(req.user.sub, req.user.companyId);
    }

    @Post('my-companies')
    @ApiOperation({ summary: 'Создать дополнительную организацию' })
    async addMyCompany(@Request() req: any, @Body() dto: { companyName: string; bin: string }) {
        return this.companyService.addMyCompany(req.user.sub, dto);
    }

    @Post('switch-company/:id')
    @ApiOperation({ summary: 'Переключить текущую организацию' })
    async switchCompany(@Request() req: any, @Param('id') companyId: string) {
        return this.companyService.switchCompany(req.user.sub, companyId);
    }

    // ==================== События (тикер) ====================

    @Get('orders/events')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER, UserRole.FORWARDER, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Последние события по заявкам компании (для живого тикера)' })
    async getOrderEvents(@Request() req: any, @Query('limit') limit?: string) {
        const parsed = parseInt(limit ?? '', 10);
        const safeLimit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : 20;
        return this.companyService.getOrderEvents(req.user.companyId, safeLimit);
    }

    @Delete('my-companies/:id')
    @ApiOperation({ summary: 'Удалить связь с организацией' })
    async deleteMyCompany(@Request() req: any, @Param('id') companyId: string) {
        return this.companyService.deleteCompany(req.user.sub, companyId);
    }
}
