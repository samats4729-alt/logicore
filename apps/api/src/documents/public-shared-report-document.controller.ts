import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Res,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    MAX_FILE_SIZE,
    SharedReportDocumentService,
} from './shared-report-document.service';
import { fileResponseHeaders } from './allowed-files';

/**
 * Документы, которые контрагент прикладывает по ссылке на отчёт.
 *
 * Учётной записи у него нет, поэтому единственный пропуск — токен ссылки:
 * он же задаёт, к чьим сделкам файл можно приложить. Частота ограничена,
 * как на остальных публичных страницах.
 */
@ApiTags('public-shared-report-documents')
@Controller('public/shared-report')
export class PublicSharedReportDocumentController {
    constructor(private readonly documents: SharedReportDocumentService) {}

    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @Post(':token/documents')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Контрагент прикладывает документ к сделкам',
        description: 'Файл ложится в документы каждой указанной заявки.',
    })
    async upload(
        @Param('token') token: string,
        @Body() body: { orderIds?: string | string[]; type?: string },
        @UploadedFile() file: Express.Multer.File,
    ) {
        // Форма отправляется как multipart, и список рейсов приходит либо
        // повторяющимся полем, либо одной строкой через запятую. Разбираем
        // здесь, чтобы служба работала с обычным массивом.
        const raw = body?.orderIds;
        const orderIds = Array.isArray(raw)
            ? raw
            : typeof raw === 'string'
                ? raw.split(',').map((id) => id.trim()).filter(Boolean)
                : [];
        if (!orderIds.length) {
            throw new BadRequestException('Укажите, к каким сделкам относится документ');
        }

        return this.documents.uploadFromSharedReport(token, { orderIds, type: body?.type }, file);
    }

    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @Get(':token/documents')
    @ApiOperation({ summary: 'Что контрагент уже приложил по этим расчётам' })
    list(@Param('token') token: string) {
        return this.documents.listFromSharedReport(token);
    }

    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @Get(':token/documents/:documentId')
    @ApiOperation({ summary: 'Открыть свой приложенный документ' })
    async read(
        @Param('token') token: string,
        @Param('documentId') documentId: string,
        @Res() res: Response,
    ) {
        const file = await this.documents.readFromSharedReport(token, documentId);
        // Те же заголовки, что и в кабинете: вложением и без права угадывать
        // тип. Здесь список разрешённых типов на входе есть, но правило
        // раздачи должно быть одно — иначе однажды разойдётся и это.
        res.set(fileResponseHeaders(file.fileName, file.mimeType));
        file.stream.pipe(res);
    }
}
