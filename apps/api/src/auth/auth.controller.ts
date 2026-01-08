import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestSmsCodeDto, VerifySmsCodeDto, LoginEmailDto, RegisterCompanyDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    // ==================== SMS Auth (Водители) ====================

    @Post('sms/request')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Запросить SMS код для входа' })
    @ApiResponse({ status: 200, description: 'Код отправлен' })
    @ApiResponse({ status: 400, description: 'Пользователь не найден' })
    async requestSmsCode(@Body() dto: RequestSmsCodeDto) {
        return this.authService.requestSmsCode(dto.phone);
    }

    @Post('sms/verify')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Проверить SMS код и получить токен' })
    @ApiResponse({ status: 200, description: 'Успешная авторизация' })
    @ApiResponse({ status: 401, description: 'Неверный код' })
    async verifySmsCode(@Body() dto: VerifySmsCodeDto) {
        return this.authService.verifySmsCode(dto.phone, dto.code, dto.deviceId);
    }

    // ==================== Email Auth (Остальные роли) ====================

    @Post('login')
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

    // ==================== Регистрация компании ====================

    @Post('register-company')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Регистрация новой компании-клиента' })
    @ApiResponse({ status: 201, description: 'Компания зарегистрирована' })
    @ApiResponse({ status: 400, description: 'Email или телефон уже зарегистрирован' })
    async registerCompany(@Body() dto: RegisterCompanyDto) {
        return this.authService.registerCompany(dto);
    }

    @Post('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Получить данные текущего пользователя' })
    async getMe(@Request() req: any) {
        return this.authService.validateUser(req.user.sub);
    }
}
