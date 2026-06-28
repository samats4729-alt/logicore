import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginEmailDto, RegisterCompanyDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    // ==================== Email Auth (Остальные роли) ====================

    @Post('login')
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вход по email и паролю' })
    @ApiResponse({ status: 200, description: 'Успешная авторизация' })
    @ApiResponse({ status: 401, description: 'Неверные учетные данные' })
    async loginEmail(@Body() dto: LoginEmailDto) {
        return this.authService.loginWithEmail(dto.email, dto.password, dto.deviceId);
    }

    // ==================== Logout ====================

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Выход из системы' })
    @ApiResponse({ status: 200, description: 'Успешный выход' })
    async logout(@Request() req: any) {
        await this.authService.logout(req.user.id);
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

    @Post('register-company')
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Регистрация новой компании-клиента' })
    @ApiResponse({ status: 201, description: 'Компания зарегистрирована' })
    @ApiResponse({ status: 400, description: 'Email или телефон уже зарегистрирован' })
    async registerCompany(@Body() dto: RegisterCompanyDto) {
        return this.authService.registerCompany(dto);
    }

    // ==================== Google Auth ====================

    @Post('google')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вход через Google' })
    async googleLogin(@Body() dto: { token: string; deviceId: string }) {
        return this.authService.loginWithGoogle(dto.token, dto.deviceId);
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
    }) {
        return this.authService.registerWithGoogle(dto.token, {
            companyName: dto.companyName,
            companyType: dto.companyType,
            bin: dto.bin,
            phone: dto.phone,
        });
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
    async registerInvitedUser(@Body() dto: any) {
        return this.authService.registerInvitedUser(dto);
    }

    @Get('company-lookup/:bin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Поиск компании по БИН/ИИН через eGov' })
    async lookupCompany(@Param('bin') bin: string) {
        return this.authService.lookupCompanyByBin(bin);
    }
}
