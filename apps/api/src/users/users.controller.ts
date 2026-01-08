import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UserRole } from '@prisma/client';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Post()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Создать пользователя' })
    async create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    @Get()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Получить список пользователей' })
    @ApiQuery({ name: 'role', required: false, enum: UserRole })
    async findAll(@Query('role') role?: UserRole) {
        return this.usersService.findAll({ role });
    }

    @Get('drivers')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить список водителей' })
    async findDrivers() {
        return this.usersService.findDrivers();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить пользователя по ID' })
    async findOne(@Param('id') id: string) {
        return this.usersService.findById(id);
    }

    @Put(':id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Обновить пользователя' })
    async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
        return this.usersService.update(id, dto);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Деактивировать пользователя' })
    async deactivate(@Param('id') id: string) {
        return this.usersService.deactivate(id);
    }

    @Post(':id/reset-device')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Сбросить привязку устройства (для водителя)' })
    async resetDevice(@Param('id') id: string) {
        await this.usersService.resetDeviceBinding(id);
        return { message: 'Привязка устройства сброшена' };
    }
}
