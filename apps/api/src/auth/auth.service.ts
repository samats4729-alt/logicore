import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SmsService } from './sms.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private redisService: RedisService,
        private smsService: SmsService,
    ) { }

    // ==================== SMS AUTH (для водителей) ====================

    /**
     * Шаг 1: Запрос SMS кода
     */
    async requestSmsCode(phone: string): Promise<{ message: string }> {
        // ТЕСТОВЫЙ РЕЖИМ: для +77771234567 код всегда 1234
        const TEST_PHONE = '+77771234567';
        const TEST_CODE = '1234';

        if (phone === TEST_PHONE || phone === '77771234567') {
            await this.redisService.setSmsCode(phone, TEST_CODE, 3600);
            console.log(`📱 [TEST MODE] Phone: ${phone}, Code: ${TEST_CODE}`);
            return { message: 'Тестовый код: 1234' };
        }

        // Проверяем существует ли пользователь
        const user = await this.prisma.user.findUnique({
            where: { phone },
        });

        if (!user) {
            throw new BadRequestException('Пользователь с таким номером не найден');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Аккаунт деактивирован');
        }

        // Генерируем и сохраняем код
        const code = this.smsService.generateCode();
        await this.redisService.setSmsCode(phone, code, 300); // 5 минут

        // Отправляем SMS
        await this.smsService.sendVerificationCode(phone, code);

        return { message: 'Код отправлен на указанный номер' };
    }

    /**
     * Шаг 2: Проверка SMS кода и выдача токена
     */
    async verifySmsCode(
        phone: string,
        code: string,
        deviceId: string,
    ): Promise<{ accessToken: string; user: any }> {
        // Проверяем код
        const savedCode = await this.redisService.getSmsCode(phone);

        if (!savedCode || savedCode !== code) {
            throw new UnauthorizedException('Неверный код подтверждения');
        }

        // Удаляем использованный код
        await this.redisService.deleteSmsCode(phone);

        // Получаем пользователя
        const user = await this.prisma.user.findUnique({
            where: { phone },
        });

        if (!user) {
            throw new UnauthorizedException('Пользователь не найден');
        }

        // Single Session Policy: проверяем активную сессию
        const existingSession = await this.redisService.getSession(user.id);
        if (existingSession && existingSession.deviceId !== deviceId) {
            // Завершаем старую сессию
            await this.prisma.session.deleteMany({
                where: { userId: user.id },
            });
        }

        // Создаем токен
        const payload = { sub: user.id, phone: user.phone, role: user.role, companyId: user.companyId };
        const accessToken = this.jwtService.sign(payload);

        // Сохраняем сессию
        const expiresIn = 60 * 60 * 24 * 7; // 7 дней
        await this.redisService.setSession(user.id, deviceId, accessToken, expiresIn);

        // Сохраняем в БД
        await this.prisma.session.create({
            data: {
                userId: user.id,
                deviceId,
                token: accessToken,
                expiresAt: new Date(Date.now() + expiresIn * 1000),
            },
        });

        return {
            accessToken,
            user: {
                id: user.id,
                phone: user.phone,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        };
    }

    // ==================== EMAIL AUTH (для остальных ролей) ====================

    /**
     * Вход по email и паролю
     */
    async loginWithEmail(
        email: string,
        password: string,
        deviceId: string,
    ): Promise<{ accessToken: string; user: any }> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            include: { company: true },
        });

        if (!user || !user.passwordHash) {
            throw new UnauthorizedException('Неверный email или пароль');
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Неверный email или пароль');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Аккаунт деактивирован');
        }

        // Single Session Policy
        const existingSession = await this.redisService.getSession(user.id);
        if (existingSession && existingSession.deviceId !== deviceId) {
            await this.prisma.session.deleteMany({
                where: { userId: user.id },
            });
        }

        // Создаем токен
        const payload = { sub: user.id, email: user.email, role: user.role, companyId: user.companyId };
        const accessToken = this.jwtService.sign(payload);

        // Сохраняем сессию
        const expiresIn = 60 * 60 * 24 * 7;
        await this.redisService.setSession(user.id, deviceId, accessToken, expiresIn);

        await this.prisma.session.create({
            data: {
                userId: user.id,
                deviceId,
                token: accessToken,
                expiresAt: new Date(Date.now() + expiresIn * 1000),
            },
        });

        return {
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                lastName: user.lastName,
                role: user.role,
                company: (user as any).company,
            },
        };
    }

    /**
     * Выход (удаление сессии)
     */
    async logout(userId: string): Promise<void> {
        await this.redisService.deleteSession(userId);
        await this.prisma.session.deleteMany({
            where: { userId },
        });
    }

    /**
     * Валидация токена и пользователя
     */
    async validateUser(userId: string): Promise<any> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { company: true },
        });

        if (!user || !user.isActive) {
            throw new UnauthorizedException('Пользователь не найден');
        }

        return user;
    }

    /**
     * Проверка активной сессии (Single Session Policy)
     */
    async validateSession(userId: string, token: string): Promise<boolean> {
        const session = await this.redisService.getSession(userId);
        return session?.token === token;
    }

    // ==================== РЕГИСТРАЦИЯ КОМПАНИИ ====================

    /**
     * Регистрация новой компании-клиента или экспедитора
     */
    async registerCompany(data: {
        companyName: string;
        companyType: 'CUSTOMER' | 'FORWARDER';
        bin?: string;
        adminEmail: string;
        adminPassword: string;
        firstName: string;
        lastName: string;
        phone: string;
    }): Promise<{ company: any; admin: any; accessToken: string }> {
        // Проверяем что email не занят
        const existingUser = await this.prisma.user.findUnique({
            where: { email: data.adminEmail },
        });
        if (existingUser) {
            throw new BadRequestException('Email уже зарегистрирован');
        }

        // Проверяем телефон
        const existingPhone = await this.prisma.user.findUnique({
            where: { phone: data.phone },
        });
        if (existingPhone) {
            throw new BadRequestException('Телефон уже зарегистрирован');
        }

        // Определяем роль на основе типа компании
        const userRole = data.companyType === 'FORWARDER'
            ? UserRole.FORWARDER
            : UserRole.COMPANY_ADMIN;

        // Создаём компанию и админа в транзакции
        const result = await this.prisma.$transaction(async (tx) => {
            // Создаём компанию
            const company = await tx.company.create({
                data: {
                    name: data.companyName,
                    bin: data.bin,
                    email: data.adminEmail,
                    phone: data.phone,
                    type: data.companyType,
                    isOurCompany: false,
                },
            });

            // Хешируем пароль
            const passwordHash = await bcrypt.hash(data.adminPassword, 10);

            // Создаём админа компании
            const admin = await tx.user.create({
                data: {
                    email: data.adminEmail,
                    phone: data.phone,
                    passwordHash,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    role: userRole,
                    companyId: company.id,
                },
            });

            return { company, admin };
        });

        // Генерируем токен
        const payload = {
            sub: result.admin.id,
            role: result.admin.role,
            companyId: result.company.id,
        };
        const accessToken = this.jwtService.sign(payload);

        return {
            company: result.company,
            admin: {
                id: result.admin.id,
                email: result.admin.email,
                firstName: result.admin.firstName,
                lastName: result.admin.lastName,
                role: result.admin.role,
                company: result.company,
            },
            accessToken,
        };
    }
}
