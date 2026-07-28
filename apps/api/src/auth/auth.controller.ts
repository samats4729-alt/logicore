import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, UseGuards, Request, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

/**
 * Сколько попыток входа с одного адреса разрешено в минуту.
 *
 * Пять — защита от подбора пароля, и на продакшене она такой и остаётся:
 * переменная задаётся только в CI. Там за пять минут прогоняется больше
 * десятка браузерных проверок, каждая со своим входом, и настоящий предел
 * блокировал бы их — проверка падала бы не из-за поломки в продукте.
 */
const LOGIN_ATTEMPTS_PER_MINUTE = Number(process.env.AUTH_THROTTLE_LIMIT) || 5;
import { AuthService } from './auth.service';
import { LoginEmailDto, RegisterCompanyDto, RegisterUserDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Response } from 'express';
import { clearAuthCookie, setAuthCookie } from './auth-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    // ==================== Email Auth (Остальные роли) ====================

    @Post('login')
    @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вход по email и паролю' })
    @ApiResponse({ status: 200, description: 'Успешная авторизация' })
    @ApiResponse({ status: 401, description: 'Неверные учетные данные' })
    async loginEmail(@Body() dto: LoginEmailDto, @Res({ passthrough: true }) response: Response) {
        const result = await this.authService.loginWithEmail(dto.email, dto.password, dto.deviceId);
        setAuthCookie(response, result.accessToken);
        return result;
    }

    // ==================== Вход водителя (мобильное приложение) ====================

    @Post('driver-login')
    @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вход водителя по телефону и паролю' })
    @ApiResponse({ status: 200, description: 'Успешная авторизация' })
    @ApiResponse({ status: 401, description: 'Неверные учетные данные' })
    async loginDriver(@Body() dto: { phone: string; password: string; deviceId: string }, @Res({ passthrough: true }) response: Response) {
        const result = await this.authService.loginDriver(dto.phone, dto.password, dto.deviceId);
        setAuthCookie(response, result.accessToken);
        return result;
    }

    // ==================== Logout ====================

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Выход из системы' })
    @ApiResponse({ status: 200, description: 'Успешный выход' })
    async logout(@Request() req: any, @Res({ passthrough: true }) response: Response) {
        await this.authService.logout(req.user.id);
        clearAuthCookie(response);
        return { message: 'Успешный выход' };
    }

    // ==================== Восстановление пароля ====================

    @Post('forgot-password')
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Запрос на восстановление пароля' })
    @ApiResponse({ status: 200, description: 'Если email существует, отправлено письмо' })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto.email);
    }

    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Сброс пароля' })
    @ApiResponse({ status: 200, description: 'Пароль успешно изменен' })
    @ApiResponse({ status: 400, description: 'Неверный или просроченный токен' })
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto.token, dto.newPassword);
    }

    // ==================== Регистрация компании ====================

    @Post('register')
    @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60000 } })
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Регистрация личного профиля',
        description: 'Организация создаётся отдельно из кабинета и проходит проверку документов.',
    })
    async register(@Body() dto: RegisterUserDto, @Res({ passthrough: true }) response: Response) {
        const result = await this.authService.registerUser(dto);
        setAuthCookie(response, result.accessToken);
        return result;
    }

    @Post('register-company')
    @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60000 } })
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Регистрация новой компании-клиента' })
    @ApiResponse({ status: 201, description: 'Компания зарегистрирована' })
    @ApiResponse({ status: 400, description: 'Email или телефон уже зарегистрирован' })
    async registerCompany(@Body() dto: RegisterCompanyDto, @Res({ passthrough: true }) response: Response) {
        const result = await this.authService.registerCompany(dto);
        setAuthCookie(response, result.accessToken);
        return result;
    }

    // ==================== Google Auth ====================

    @Post('google')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вход через Google' })
    async googleLogin(@Body() dto: { token: string; deviceId: string }, @Res({ passthrough: true }) response: Response) {
        const result = await this.authService.loginWithGoogle(dto.token, dto.deviceId);
        if ('accessToken' in result && result.accessToken) setAuthCookie(response, result.accessToken);
        return result;
    }

    @Post('google/register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Регистрация через Google' })
    async googleRegister(@Body() dto: {
        token: string;
        companyName: string;
        companyType: 'CUSTOMER' | 'FORWARDER';
        bin: string;
        phone: string;
    }, @Res({ passthrough: true }) response: Response) {
        const result = await this.authService.registerWithGoogle(dto.token, {
            companyName: dto.companyName,
            companyType: dto.companyType,
            bin: dto.bin,
            phone: dto.phone,
        });
        setAuthCookie(response, result.accessToken);
        return result;
    }

    @Post('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Получить данные текущего пользователя' })
    async getMe(@Request() req: any) {
        return this.authService.validateUser(req.user.sub, req.user.companyId, req.user.role);
    }

    // ==================== Регистрация по приглашению ====================

    @Get('invitation/:token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Получить информацию о приглашении' })
    async getInvitation(@Param('token') token: string) {
        return this.authService.getInvitationDetails(token);
    }

    @Post('register/invited')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Зарегистрироваться по приглашению' })
    async registerInvitedUser(@Body() dto: any, @Res({ passthrough: true }) response: Response) {
        const result = await this.authService.registerInvitedUser(dto);
        setAuthCookie(response, result.accessToken);
        return result;
    }

    @Get('company-lookup/:bin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Поиск компании по БИН/ИИН через eGov' })
    async lookupCompany(@Param('bin') bin: string) {
        return this.authService.lookupCompanyByBin(bin);
    }
}
