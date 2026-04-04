import { Controller, Get, Post, Put, Delete, Body, Param, Res, UseGuards, UseInterceptors, UploadedFile, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CreateCompanyUserDto, UpdateCompanyProfileDto } from './dto/company.dto';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('company')
@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CompanyController {
    constructor(private companyService: CompanyService) { }

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
    async getCompanyUsers(@Request() req: any) {
        return this.companyService.getCompanyUsers(req.user.companyId);
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
        @Body() dto: { email: string; role: UserRole; permissions: string[] },
    ) {
        return this.companyService.createInvitation(req.user.companyId, dto.email, dto.role, dto.permissions);
    }

    @Delete('invitations/:id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отменить приглашение' })
    async cancelInvitation(@Request() req: any, @Param('id') invitationId: string) {
        return this.companyService.cancelInvitation(req.user.companyId, invitationId);
    }

    // ==================== Заявки компании ====================

    @Get('orders')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER)
    @ApiOperation({ summary: 'Получить заявки своей компании' })
    async getCompanyOrders(@Request() req: any) {
        return this.companyService.getCompanyOrders(req.user.companyId);
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

        const absolutePath = path.join(process.cwd(), stampPath);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ message: 'Файл не найден' });
        }

        return res.sendFile(absolutePath);
    }

    // ==================== Экспедиторы ====================

    @Get('forwarders')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить список экспедиторов для выбора' })
    async getForwarders() {
        return this.companyService.getForwarders();
    }
}
