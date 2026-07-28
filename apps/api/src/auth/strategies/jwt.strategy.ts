import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { extractAuthToken } from '../auth-cookie';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        private authService: AuthService,
    ) {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
            throw new Error('JWT_SECRET environment variable is not set');
        }
        super({
            // Browser uses an httpOnly cookie; mobile and API clients keep Bearer auth.
            jwtFromRequest: extractAuthToken,
            ignoreExpiration: false,
            secretOrKey: secret,
            passReqToCallback: true,
        });
    }

    async validate(req: any, payload: any) {
        // Получаем токен из заголовка
        const token = extractAuthToken(req);

        // Проверяем активность сессии (Single Session Policy)
        if (!token) {
            throw new UnauthorizedException('Токен не предоставлен');
        }

        // Проверка активности пользователя.
        //
        // Причину называем ту, которая есть на самом деле. «Пользователь не
        // найден» человеку, который только что вошёл под своей почтой, не
        // объясняет ничего — а происходило это, когда его убрали из компании.
        const found = await this.authService.findUserById(payload.sub, payload.companyId);
        if ('reason' in found) {
            if (found.reason === 'NO_RELATION') {
                throw new UnauthorizedException(
                    'Вас больше нет в этой компании. Попросите руководителя вернуть доступ.',
                );
            }
            if (found.reason === 'COMPANY_OFF') {
                throw new UnauthorizedException(
                    'Компания отключена. Обратитесь к её руководителю.',
                );
            }
            throw new UnauthorizedException('Пользователь не найден');
        }
        const user = found.user;
        if (!user.isActive) {
            throw new UnauthorizedException('Аккаунт деактивирован');
        }

        // Проверка сессии через Redis (Single Session Policy)
        const isValidSession = await this.authService.validateSession(payload.sub, token);
        if (!isValidSession) {
            throw new UnauthorizedException('Сессия недействительна. Возможно вы вошли с другого устройства.');
        }

        return {
            ...payload,
            id: payload.sub,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
            permissions: user.permissions ?? [],
        };
    }
}
