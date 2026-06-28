import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private resend: Resend | null = null;
    private fromEmail: string;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('RESEND_API_KEY');
        this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'noreply@logicore.kz';

        if (apiKey) {
            this.resend = new Resend(apiKey);
            this.logger.log('✅ Resend email service initialized');
        } else {
            this.logger.warn('⚠️ RESEND_API_KEY not set, emails will be logged to console');
        }
    }

    async sendPasswordResetEmail(to: string, resetToken: string, userName: string): Promise<void> {
        const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

        const subject = 'Восстановление пароля — LogiCore';
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
    <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">LogiCore</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Система управления логистикой</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px 24px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a;">Восстановление пароля</h2>
            <p style="color: #595959; font-size: 15px; line-height: 1.6; margin: 0 0 8px;">
                Здравствуйте${userName ? ', ' + userName : ''}!
            </p>
            <p style="color: #595959; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                Мы получили запрос на восстановление пароля для вашего аккаунта. Нажмите кнопку ниже, чтобы установить новый пароль:
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
                <a href="${resetLink}" 
                   style="display: inline-block; background: #1677ff; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                    Сбросить пароль
                </a>
            </div>
            
            <p style="color: #8c8c8c; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
                Если кнопка не работает, скопируйте эту ссылку в браузер:
            </p>
            <p style="color: #1677ff; font-size: 12px; word-break: break-all; margin: 4px 0 0;">
                ${resetLink}
            </p>
            
            <hr style="border: none; border-top: 1px solid #f0f0f0; margin: 24px 0;">
            
            <p style="color: #bfbfbf; font-size: 12px; line-height: 1.5; margin: 0;">
                ⏱ Ссылка действительна 30 минут.<br>
                Если вы не запрашивали сброс пароля, проигнорируйте это письмо.
            </p>
        </div>
    </div>
</body>
</html>`;

        if (!this.resend) {
            this.logger.log(`📧 [DEV] Password reset email for ${to}:`);
            this.logger.log(`   Reset link: ${resetLink}`);
            return;
        }

        try {
            const result = await this.resend.emails.send({
                from: this.fromEmail,
                to,
                subject,
                html,
            });
            this.logger.log(`📧 Password reset email sent to ${to}, id: ${(result as any)?.data?.id}`);
        } catch (error: any) {
            this.logger.error(`Failed to send password reset email to ${to}: ${error.message}`);
            throw error;
        }
    }

    async sendPowerOfAttorneyEmail(
        to: string,
        orderNumber: string,
        senderCompanyName: string,
        pdfBuffer: Buffer,
        driverInfo?: {
            fullName?: string;
            vehicleModel?: string;
            vehiclePlate?: string;
            phone?: string;
            route?: string;
        },
    ): Promise<void> {
        const subject = `Доверенность к заявке № ${orderNumber} — LogiCore`;

        // Формируем блок ключевых данных водителя
        const driverRows: string[] = [];
        if (driverInfo?.fullName) {
            driverRows.push(`
                <tr>
                    <td style="padding: 8px 12px; color: #8c8c8c; font-size: 13px; white-space: nowrap; vertical-align: top;">👤 Водитель</td>
                    <td style="padding: 8px 12px; color: #1a1a1a; font-size: 14px; font-weight: 600;">${driverInfo.fullName}</td>
                </tr>`);
        }
        if (driverInfo?.vehicleModel || driverInfo?.vehiclePlate) {
            const vehicleText = [driverInfo.vehicleModel, driverInfo.vehiclePlate].filter(Boolean).join(' · ');
            driverRows.push(`
                <tr>
                    <td style="padding: 8px 12px; color: #8c8c8c; font-size: 13px; white-space: nowrap; vertical-align: top;">🚛 Транспорт</td>
                    <td style="padding: 8px 12px; color: #1a1a1a; font-size: 14px; font-weight: 600;">${vehicleText}</td>
                </tr>`);
        }
        if (driverInfo?.phone) {
            driverRows.push(`
                <tr>
                    <td style="padding: 8px 12px; color: #8c8c8c; font-size: 13px; white-space: nowrap; vertical-align: top;">📞 Телефон</td>
                    <td style="padding: 8px 12px; color: #1a1a1a; font-size: 14px; font-weight: 600;">${driverInfo.phone}</td>
                </tr>`);
        }
        if (driverInfo?.route) {
            driverRows.push(`
                <tr>
                    <td style="padding: 8px 12px; color: #8c8c8c; font-size: 13px; white-space: nowrap; vertical-align: top;">📍 Маршрут</td>
                    <td style="padding: 8px 12px; color: #1a1a1a; font-size: 14px; font-weight: 600;">${driverInfo.route}</td>
                </tr>`);
        }

        const driverInfoBlock = driverRows.length > 0 ? `
            <table cellpadding="0" cellspacing="0" style="width: 100%; background: #f0f5ff; border-radius: 8px; border: 1px solid #d6e4ff; margin: 0 0 20px;">
                ${driverRows.join('')}
            </table>` : '';

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
    <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">LogiCore</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Система управления логистикой</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px 24px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a;">Доверенность на водителя</h2>

            <!-- Ключевые данные рейса -->
            ${driverInfoBlock}

            <p style="color: #595959; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
                Здравствуйте!
            </p>
            <p style="color: #595959; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                Вам направлена доверенность на водителя от компании <strong>${senderCompanyName}</strong> по заявке <strong>№ ${orderNumber}</strong>. Документ прикреплен к этому письму в формате PDF.
            </p>
            
            <hr style="border: none; border-top: 1px solid #f0f0f0; margin: 24px 0;">
            
            <p style="color: #bfbfbf; font-size: 12px; line-height: 1.5; margin: 0;">
                Это письмо отправлено автоматически из системы LogiCore.<br>
                Пожалуйста, не отвечайте на него.
            </p>
        </div>
    </div>
</body>
</html>`;

        if (!this.resend) {
            this.logger.log(`📧 [DEV] Power of Attorney email for ${to} (from: ${senderCompanyName}, Order: ${orderNumber}), attachment size: ${pdfBuffer.length} bytes`);
            return;
        }

        try {
            const result = await this.resend.emails.send({
                from: this.fromEmail,
                to,
                subject,
                html,
                attachments: [
                    {
                        filename: `doverennost_order_${orderNumber}.pdf`,
                        content: pdfBuffer,
                    }
                ]
            });
            this.logger.log(`📧 Power of Attorney email sent to ${to}, id: ${(result as any)?.data?.id}`);
        } catch (error: any) {
            this.logger.error(`Failed to send Power of Attorney email to ${to}: ${error.message}`);
            throw error;
        }
    }

    async sendCounterpartyReportEmail(
        to: string,
        shareUrl: string,
        senderCompanyName: string,
        counterpartyName: string,
    ): Promise<void> {
        const subject = `Отчёт по взаиморасчётам — ${senderCompanyName}`;
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
    <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">LogiCore</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Система управления логистикой</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px 24px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a1a;">Отчёт по взаиморасчётам</h2>
            <p style="color: #595959; font-size: 15px; line-height: 1.6; margin: 0 0 8px;">
                Здравствуйте!
            </p>
            <p style="color: #595959; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                Компания <strong>${senderCompanyName}</strong> направила вам отчёт по взаиморасчётам. Нажмите кнопку ниже, чтобы посмотреть детали:
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
                <a href="${shareUrl}" 
                   style="display: inline-block; background: #1677ff; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                    Открыть отчёт
                </a>
            </div>
            
            <p style="color: #8c8c8c; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
                Если кнопка не работает, скопируйте эту ссылку в браузер:
            </p>
            <p style="color: #1677ff; font-size: 12px; word-break: break-all; margin: 4px 0 0;">
                ${shareUrl}
            </p>
            
            <hr style="border: none; border-top: 1px solid #f0f0f0; margin: 24px 0;">
            
            <p style="color: #bfbfbf; font-size: 12px; line-height: 1.5; margin: 0;">
                ⏱ Ссылка действительна 7 дней.<br>
                Это письмо отправлено автоматически из системы LogiCore.
            </p>
        </div>
    </div>
</body>
</html>`;

        if (!this.resend) {
            this.logger.log(`📧 [DEV] Counterparty report email for ${to}:`);
            this.logger.log(`   Report link: ${shareUrl}`);
            return;
        }

        try {
            const result = await this.resend.emails.send({
                from: this.fromEmail,
                to,
                subject,
                html,
            });
            this.logger.log(`📧 Counterparty report email sent to ${to}, id: ${(result as any)?.data?.id}`);
        } catch (error: any) {
            this.logger.error(`Failed to send counterparty report email to ${to}: ${error.message}`);
            throw error;
        }
    }
}
