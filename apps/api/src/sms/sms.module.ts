import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PhoneCodeService } from './phone-code.service';
import { SmsAuthController } from './sms-auth.controller';

/** Коды из СМС для регистрации и входа водителя (вопрос 26). */
@Module({
    imports: [PrismaModule, AuthModule],
    controllers: [SmsAuthController],
    providers: [PhoneCodeService],
    exports: [PhoneCodeService],
})
export class SmsModule {}
