import { Body, Controller, Get, HttpCode, HttpStatus, Post, Request, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { setAuthCookie } from '../auth/auth-cookie';
import { PhoneCodeService } from './phone-code.service';

const LOGIN_ATTEMPTS_PER_MINUTE = Number(process.env.AUTH_THROTTLE_LIMIT) || 5;

export class SendCodeDto {
    @ApiProperty({ example: '+77011234567' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    phone: string;

    @ApiProperty({ enum: ['REGISTER', 'LOGIN'] })
    @IsIn(['REGISTER', 'LOGIN'])
    purpose: 'REGISTER' | 'LOGIN';
}

export class SmsLoginDto {
    @ApiProperty({ example: '+77011234567' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    phone: string;

    @ApiProperty({ example: '123456' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(10)
    code: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    deviceId: string;
}

/** Адрес человека за прокси Railway — первый в X-Forwarded-For, как при подписи договора. */
function clientIp(req: any): string | null {
    return (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || null;
}

/**
 * Регистрация и вход водителя по коду из СМС (решение владельца 25.10.2026,
 * вопрос 26). Открыты без входа: человек ещё не вошёл. Замки: код приходит
 * только на сам номер, живёт пять минут, пять неверных попыток; отправка
 * ограничена по номеру и адресу (см. `PhoneCodeService`). Перечислены в
 * auth/open-routes.spec.ts.
 */
@ApiTags('auth')
@Controller('auth/sms')
export class SmsAuthController {
    constructor(
        private readonly codes: PhoneCodeService,
        private readonly auth: AuthService,
    ) {}

    @Get('status')
    @ApiOperation({ summary: 'Включён ли вход по СМС — приложение показывает кнопки по ответу' })
    status() {
        return { enabled: this.codes.enabled() };
    }

    @Post('send-code')
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Прислать код из СМС для регистрации или входа' })
    sendCode(@Body() dto: SendCodeDto, @Request() req: any) {
        return this.codes.send(dto.phone, dto.purpose, clientIp(req));
    }

    @Post('login')
    @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вход водителя по коду из СМС' })
    async login(@Body() dto: SmsLoginDto, @Res({ passthrough: true }) response: Response) {
        const phone = await this.codes.verify(dto.phone, 'LOGIN', dto.code);
        const result = await this.auth.loginDriverByVerifiedPhone(phone, dto.deviceId);
        setAuthCookie(response, result.accessToken);
        return result;
    }
}
