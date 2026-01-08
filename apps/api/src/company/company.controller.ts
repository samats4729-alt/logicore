import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CreateCompanyUserDto } from './dto/company.dto';

@ApiTags('company')
@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CompanyController {
    constructor(private companyService: CompanyService) { }

    // ==================== Пользователи компании ====================

    @Get('users')
    @Roles(UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Получить пользователей своей компании' })
    async getCompanyUsers(@Request() req: any) {
        return this.companyService.getCompanyUsers(req.user.companyId);
    }

    @Post('users')
    @Roles(UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Создать пользователя в своей компании' })
    async createCompanyUser(@Request() req: any, @Body() dto: CreateCompanyUserDto) {
        return this.companyService.createCompanyUser(req.user.companyId, dto);
    }

    @Put('users/:id')
    @Roles(UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Обновить пользователя компании' })
    async updateCompanyUser(
        @Request() req: any,
        @Param('id') userId: string,
        @Body() dto: Partial<CreateCompanyUserDto>,
    ) {
        return this.companyService.updateCompanyUser(req.user.companyId, userId, dto);
    }

    @Delete('users/:id')
    @Roles(UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Деактивировать пользователя компании' })
    async deleteCompanyUser(@Request() req: any, @Param('id') userId: string) {
        return this.companyService.deactivateCompanyUser(req.user.companyId, userId);
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
    @Roles(UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.WAREHOUSE_MANAGER)
    @ApiOperation({ summary: 'Получить профиль компании' })
    async getCompanyProfile(@Request() req: any) {
        return this.companyService.getCompanyProfile(req.user.companyId);
    }
}
