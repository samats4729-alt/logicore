import { Controller, Get, Post, Put, Body, Param, UseGuards, Request, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole, DocumentType } from '@prisma/client';

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DocumentsController {
    constructor(private documentsService: DocumentsService) { }

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
        return this.documentsService.uploadFile(orderId, req.user.sub, type, file);
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
        return this.documentsService.create({
            ...dto,
            uploadedById: req.user.sub,
        });
    }

    @Get('order/:orderId')
    @ApiOperation({ summary: 'Получить документы заявки' })
    async findByOrder(@Param('orderId') orderId: string) {
        return this.documentsService.findByOrder(orderId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить документ по ID' })
    async findOne(@Param('id') id: string) {
        return this.documentsService.findById(id);
    }

    @Get(':id/download')
    @ApiOperation({ summary: 'Скачать файл документа' })
    async downloadFile(@Param('id') id: string, @Res() res: Response) {
        const doc = await this.documentsService.findById(id);
        const absolutePath = path.join(process.cwd(), doc.fileUrl);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ message: 'Файл не найден' });
        }
        return res.sendFile(absolutePath);
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
