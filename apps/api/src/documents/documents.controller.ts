import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { DocumentsService } from './documents.service';
import { S3Service } from '../s3/s3.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { UserRole, DocumentType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';

/** Как называть вид документа в журнале действий, чтобы читалось по-человечески. */
const DOCUMENT_KIND_LABELS: Record<string, string> = {
    TTN: 'Товарно-транспортная накладная',
    POWER_OF_ATTORNEY: 'Доверенность',
    ACT: 'Акт',
    INVOICE: 'Счёт',
    OTHER: 'Документ',
    COMPANY_REGISTRATION: 'Справка о регистрации',
    DIRECTOR_APPOINTMENT: 'Приказ о назначении руководителя',
    DIRECTOR_ID: 'Удостоверение руководителя',
};

const documentLabel = (type?: string, fileName?: string) => {
    const kind = DOCUMENT_KIND_LABELS[type || ''] || 'Документ';
    return fileName ? `${kind} — ${fileName}` : kind;
};

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('documents', 'orders')
@ApiBearerAuth()
export class DocumentsController {
    constructor(
        private documentsService: DocumentsService,
        private s3Service: S3Service,
        private auditService: AuditService,
    ) { }

    @Post('upload/:orderId')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }))
    @ApiOperation({ summary: 'Загрузить файл документа для заявки' })
    @ApiConsumes('multipart/form-data')
    async uploadFile(
        @Param('orderId') orderId: string,
        @Body('type') type: DocumentType,
        @UploadedFile() file: Express.Multer.File,
        @Request() req: any,
    ) {
        const document = await this.documentsService.uploadFile(orderId, req.user.sub, type, file, req.user);
        // Кто вложил файл в рейс — вопрос, который всплывает всегда, и раньше
        // ответа на него не было нигде.
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'CREATE',
            entity: 'document',
            entityId: (document as any)?.id,
            entityLabel: documentLabel(type, file?.originalname),
            orderId,
        });
        return document;
    }

    @Post()
    @ApiOperation({ summary: 'Загрузить документ (метаданные)' })
    async create(
        @Body() dto: {
            type: DocumentType;
            fileName: string;
            fileUrl: string;
            fileSize: number;
            mimeType: string;
            orderId?: string;
        },
        @Request() req: any,
    ) {
        const document = await this.documentsService.create({
            ...dto,
            uploadedById: req.user.sub,
        }, req.user);
        if (dto.orderId) {
            await this.auditService.log({
                companyId: req.user.companyId,
                user: req.user,
                action: 'CREATE',
                entity: 'document',
                entityId: (document as any)?.id,
                entityLabel: documentLabel(dto.type, dto.fileName),
                orderId: dto.orderId,
            });
        }
        return document;
    }

    // Объявлено до `:id`, иначе путь съедается параметром.
    @Get()
    @ApiOperation({
        summary: 'Журнал вложенных документов компании',
        description: 'Накладные, акты и прочие файлы рейсов — списком за период, с поиском.',
    })
    async list(
        @Request() req: any,
        @Query('type') type?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('search') search?: string,
    ) {
        return this.documentsService.listForCompany(req.user.companyId, {
            // Чужое значение в тип не пускаем: неизвестное — это «без фильтра»,
            // а не ошибка на весь экран.
            type: type && type in DocumentType ? (type as DocumentType) : undefined,
            from,
            to,
            search: search?.slice(0, 100),
        });
    }

    // Объявлено до `:id`, иначе путь съедается параметром.
    @Get('all')
    @Roles(UserRole.ADMIN)
    @ApiOperation({
        summary: 'Журнал документов по всем компаниям',
        description: 'Раздел «Документы» в админке платформы: у администратора своей компании нет.',
    })
    async listAll(
        @Query('type') type?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('search') search?: string,
    ) {
        return this.documentsService.listForCompany(
            undefined,
            {
                type: type && type in DocumentType ? (type as DocumentType) : undefined,
                from,
                to,
                search: search?.slice(0, 100),
            },
            { allCompanies: true },
        );
    }

    @Get('order/:orderId')
    @ApiOperation({ summary: 'Получить документы заявки' })
    async findByOrder(@Param('orderId') orderId: string, @Request() req: any) {
        return this.documentsService.findByOrder(orderId, req.user);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить документ по ID' })
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.documentsService.findById(id, req.user);
    }

    @Get(':id/download')
    @ApiOperation({ summary: 'Скачать файл документа' })
    async downloadFile(@Param('id') id: string, @Res() res: Response, @Request() req: any) {
        const doc = await this.documentsService.findById(id, req.user);

        if (this.s3Service.isS3Enabled()) {
            try {
                const { stream, mimeType } = await this.s3Service.downloadFile(doc.fileUrl);
                res.setHeader('Content-Type', mimeType || doc.mimeType || 'application/octet-stream');
                return stream.pipe(res);
            } catch (error) {
                // Fallback to local file if S3 download fails
                const absolutePath = path.join(process.cwd(), doc.fileUrl);
                if (fs.existsSync(absolutePath)) {
                    return res.sendFile(absolutePath);
                }
                return res.status(404).json({ message: 'Файл не найден в S3 и локально' });
            }
        } else {
            const absolutePath = path.join(process.cwd(), doc.fileUrl);
            if (!fs.existsSync(absolutePath)) {
                return res.status(404).json({ message: 'Файл не найден' });
            }
            return res.sendFile(absolutePath);
        }
    }

    @Put(':id/verify')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Верифицировать документ' })
    async verify(@Param('id') id: string) {
        return this.documentsService.verify(id);
    }

    @Get('power-of-attorney/:orderId')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Генерация доверенности (данные для PDF)' })
    async generatePowerOfAttorney(@Param('orderId') orderId: string) {
        return this.documentsService.generatePowerOfAttorney(orderId);
    }
}