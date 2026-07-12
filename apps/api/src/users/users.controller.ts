import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, BadRequestException, UseInterceptors, UploadedFile, Res, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UsersService } from './users.service';
import { S3Service } from '../s3/s3.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
    constructor(private usersService: UsersService, private s3Service: S3Service) { }

    // ==================== Фото профиля ====================
    // Без @Roles: каждый авторизованный пользователь управляет только своим фото.

    @Post('me/avatar')
    @UseInterceptors(FileInterceptor('avatar', {
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
        fileFilter: (req, file, cb) => {
            if (!file.mimetype.match(/^image\/(png|jpeg|jpg|webp)$/)) {
                cb(new Error('Только PNG/JPG/WEBP файлы'), false);
            } else {
                cb(null, true);
            }
        },
    }))
    @ApiOperation({ summary: 'Загрузить фото своего профиля' })
    @ApiConsumes('multipart/form-data')
    async uploadMyAvatar(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('Файл не загружен');
        }
        return this.usersService.uploadAvatar(req.user.sub, file);
    }

    @Get('me/avatar')
    @ApiOperation({ summary: 'Получить фото своего профиля' })
    async getMyAvatar(@Request() req: any, @Res() res: Response) {
        return this.streamAvatar(req.user.sub, req.user, res);
    }

    @Get(':id/avatar')
    @ApiOperation({ summary: 'Получить фото профиля сотрудника своей компании' })
    async getUserAvatar(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
        return this.streamAvatar(id, req.user, res);
    }

    private async streamAvatar(targetUserId: string, requester: any, res: Response) {
        const avatarPath = await this.usersService.getAvatarPathFor(targetUserId, requester);
        if (!avatarPath) {
            return res.status(404).json({ message: 'Фото не загружено' });
        }

        if (this.s3Service.isS3Enabled()) {
            try {
                const { stream, mimeType } = await this.s3Service.downloadFile(avatarPath);
                res.setHeader('Content-Type', mimeType || 'image/png');
                return stream.pipe(res);
            } catch (error) {
                const absolutePath = path.join(process.cwd(), avatarPath);
                if (fs.existsSync(absolutePath)) {
                    return res.sendFile(absolutePath);
                }
                return res.status(404).json({ message: 'Файл не найден' });
            }
        }

        const absolutePath = path.join(process.cwd(), avatarPath);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ message: 'Файл не найден' });
        }
        return res.sendFile(absolutePath);
    }

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
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Получить список водителей' })
    async findDrivers(@Request() req: any) {
        const companyId = req.user.role === 'ADMIN' ? undefined : req.user.companyId;
        return this.usersService.findDrivers(companyId);
    }

    @Get(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить пользователя по ID' })
    async findOne(@Param('id') id: string) {
        return this.usersService.findById(id);
    }

    // No @Roles decorator here since any logged-in user (including DRIVER, RECIPIENT, etc.)
    // is allowed to modify their own personal profile information.
    @Put('profile')
    @ApiOperation({ summary: 'Обновить профиль авторизованного пользователя' })
    async updateProfile(@Request() req: any, @Body() dto: Partial<UpdateUserDto>) {
        return this.usersService.update(req.user.sub, dto);
    }

    // No @Roles decorator here since any logged-in user (including DRIVER, RECIPIENT, etc.)
    // is allowed to change their own password, provided they supply the correct current password.
    @Put('password')
    @ApiOperation({ summary: 'Изменить пароль авторизованного пользователя' })
    async updatePassword(@Request() req: any, @Body() dto: any) {
        if (!dto.currentPassword) {
            throw new BadRequestException('Текущий пароль обязателен');
        }
        if (!dto.newPassword) {
            throw new BadRequestException('Новый пароль обязателен');
        }
        
        const user = await this.usersService.findById(req.user.sub);
        if (!user) {
            throw new BadRequestException('Пользователь не найден');
        }

        const isPasswordValid = user.passwordHash
            ? await bcrypt.compare(dto.currentPassword, user.passwordHash)
            : false;
        if (!isPasswordValid) {
            throw new BadRequestException('Неверный текущий пароль');
        }

        return this.usersService.updatePassword(req.user.sub, dto.newPassword);
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