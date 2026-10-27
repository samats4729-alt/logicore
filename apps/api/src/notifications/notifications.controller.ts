import { Body, Controller, HttpCode, HttpStatus, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AllowWithoutCompany, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { NotificationsService } from './notifications.service';

export class PushDeviceDto {
    @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
    @IsString()
    @MaxLength(250)
    token: string;

    @ApiProperty({ required: false, enum: ['android', 'ios'] })
    @IsOptional()
    @IsIn(['android', 'ios'])
    platform?: 'android' | 'ios';

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    deviceId?: string;
}

/**
 * Телефон для push-уведомлений — из приложения водителя. Компании у
 * водителя биржи нет, поэтому вход без компании разрешён; запомнить можно
 * только свой телефон: пользователь берётся из входа, а не из запроса.
 */
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@AllowWithoutCompany()
@Roles(UserRole.DRIVER)
@ApiBearerAuth()
export class NotificationsController {
    constructor(private readonly notifications: NotificationsService) {}

    @Post('push-devices')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Запомнить телефон для push-уведомлений' })
    register(@Request() req: any, @Body() dto: PushDeviceDto) {
        return this.notifications.registerDevice(req.user.sub, dto.token, dto.platform, dto.deviceId);
    }

    /**
     * Проверка из приложения: уведомление на свои же телефоны. Чтобы водитель
     * (и владелец) убедились, что уведомления доходят, не трогая заявок.
     */
    @Post('push-devices/test')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Проверочное уведомление на свой телефон' })
    async test(@Request() req: any) {
        const sent = await this.notifications.sendToUsers([req.user.sub], {
            title: 'Проверка уведомлений',
            body: 'Уведомления работают: сюда придут рейсы, решения по анкете и выплаты.',
            data: { type: 'TEST' },
        });
        return { sent };
    }

    @Post('push-devices/remove')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Забыть телефон — водитель вышел из приложения' })
    remove(@Request() req: any, @Body() dto: PushDeviceDto) {
        return this.notifications.unregisterDevice(req.user.sub, dto.token);
    }
}
