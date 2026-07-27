import { Body, Controller, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MAX_FILE_SIZE, PaymentProofService } from './payment-proof.service';
import { SubmitPaymentProofDto } from './dto/submit-payment-proof.dto';

/**
 * Контрагент присылает чек по ссылке на отчёт — без учётной записи.
 *
 * Ограничение частоты обязательно: эндпоинт принимает файлы и открыт всем,
 * у кого есть ссылка.
 */
@ApiTags('public-payment-proofs')
@Controller('public/payment-proofs')
export class PublicPaymentProofController {
    constructor(private readonly proofs: PaymentProofService) {}

    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Post(':token')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Приложить чек об оплате по сделке',
        description: 'Чек попадает в очередь «на проверке» и сам платёж не создаёт.',
    })
    async submit(
        @Param('token') token: string,
        @Body() dto: SubmitPaymentProofDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.proofs.submitFromSharedReport(token, dto, file);
    }
}
