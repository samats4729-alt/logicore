import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
    private readonly login: string;
    private readonly password: string;
    private readonly sender: string;

    constructor(private configService: ConfigService) {
        this.login = this.configService.get('SMSC_LOGIN') || '';
        this.password = this.configService.get('SMSC_PASSWORD') || '';
        this.sender = this.configService.get('SMSC_SENDER') || 'LogComp';
    }

    /**
     * Генерация 4-значного кода подтверждения
     */
    generateCode(): string {
        return '1234'; // Math.floor(1000 + Math.random() * 9000).toString();
    }

    /**
     * Отправка SMS через SMSC.kz
     * Документация: https://smsc.kz/api/
     */
    async sendSms(phone: string, message: string): Promise<boolean> {
        // Нормализация номера телефона (убираем + и пробелы)
        const normalizedPhone = phone.replace(/[\s\+\-\(\)]/g, '');

        // В dev режиме просто логируем
        if (this.configService.get('NODE_ENV') === 'development') {
            console.log(`📱 [DEV SMS] To: ${normalizedPhone}, Message: ${message}`);
            return true;
        }

        // Проверяем наличие креденшлов
        if (!this.login || !this.password) {
            console.warn('⚠️ SMSC credentials not configured, skipping SMS');
            return false;
        }

        try {
            const params = new URLSearchParams({
                login: this.login,
                psw: this.password,
                phones: normalizedPhone,
                mes: message,
                sender: this.sender,
                charset: 'utf-8',
                fmt: '3', // JSON response
            });

            const response = await fetch(`https://smsc.kz/sys/send.php?${params}`);
            const result = await response.json();

            if (result.error) {
                console.error('SMS Error:', result.error);
                throw new HttpException(
                    'Ошибка отправки SMS',
                    HttpStatus.SERVICE_UNAVAILABLE,
                );
            }

            console.log(`✅ SMS sent to ${normalizedPhone}, ID: ${result.id}`);
            return true;
        } catch (error) {
            console.error('SMS sending failed:', error);
            throw new HttpException(
                'Ошибка отправки SMS',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }

    /**
     * Отправка кода подтверждения
     */
    async sendVerificationCode(phone: string, code: string): Promise<boolean> {
        const message = `Ваш код подтверждения LogComp: ${code}`;
        return this.sendSms(phone, message);
    }
}
