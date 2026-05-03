import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        private authService: AuthService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET'),
            passReqToCallback: true,
        });
    }

    async validate(req: any, payload: any) {
        // Получаем токен из заголовка
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

        // Проверяем активность сессии (Single Session Policy)
        if (!token) {
            throw new UnauthorizedException('Токен не предоставлен');
        }

        // Проверка сессии через Redis (Single Session Policy)
        const isValidSession = await this.authService.validateSession(payload.sub, token);
        if (!isValidSession) {
            throw new UnauthorizedException('Сессия недействительна. Возможно вы вошли с другого устройства.');
        }

        return payload;
    }
}
