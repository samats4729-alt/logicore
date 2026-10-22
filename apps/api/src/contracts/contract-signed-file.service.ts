import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_SIZE } from '../documents/allowed-files';
import { decodeUploadName } from '../common/utils/upload-name';

/**
 * Подписанный экземпляр договора (задачи шефа, G5).
 *
 * Договор в системе — это текст, из которого печатается PDF. Подписывают
 * его на бумаге или в чужой ЭДО, и потом скан лежал где угодно, только не
 * рядом с договором. Здесь к договору прикладывается один файл — то, что
 * подписали обе стороны. Видят его обе стороны договора: запись у них одна.
 * Новый файл заменяет прежний.
 */
@Injectable()
export class ContractSignedFileService {
    constructor(
        private prisma: PrismaService,
        private s3Service: S3Service,
    ) { }

    private async contractOf(contractId: string, companyId: string) {
        const contract = await this.prisma.contract.findUnique({
            where: { id: contractId },
            select: {
                id: true, contractNumber: true, customerCompanyId: true, forwarderCompanyId: true,
                signedFileUrl: true, signedFileName: true, signedFileMime: true,
            },
        });
        if (!contract) throw new NotFoundException('Договор не найден');
        if (contract.customerCompanyId !== companyId && contract.forwarderCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа к этому договору');
        }
        return contract;
    }

    async attach(
        contractId: string,
        companyId: string,
        file: { originalname: string; buffer: Buffer; mimetype: string; size: number } | undefined,
    ) {
        if (!file) throw new BadRequestException('Приложите файл');
        if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
            throw new BadRequestException('Подойдёт PDF или фотография (JPG, PNG, HEIC, WebP) подписанного договора');
        }
        if (file.size > MAX_UPLOAD_SIZE) {
            throw new BadRequestException('Файл больше 15 МБ — сожмите или отсканируйте заново');
        }
        const contract = await this.contractOf(contractId, companyId);

        const safeName = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80);
        const relativePath = `uploads/contracts/${contractId}_${Date.now()}_${safeName}`;
        if (this.s3Service.isS3Enabled()) {
            await this.s3Service.uploadFile(relativePath, file.buffer, file.mimetype);
        } else {
            fs.mkdirSync(path.join(process.cwd(), 'uploads', 'contracts'), { recursive: true });
            fs.writeFileSync(path.join(process.cwd(), relativePath), file.buffer);
        }

        const updated = await this.prisma.contract.update({
            where: { id: contractId },
            data: {
                signedFileUrl: relativePath,
                signedFileName: decodeUploadName(file.originalname),
                signedFileMime: file.mimetype,
                signedFileSize: file.size,
                signedUploadedAt: new Date(),
            },
            select: { id: true, signedFileName: true, signedFileSize: true, signedUploadedAt: true },
        });
        // Прежний файл больше никому не нужен — запись теперь смотрит на новый.
        if (contract.signedFileUrl) await this.removeStored(contract.signedFileUrl);
        return updated;
    }

    async open(contractId: string, companyId: string): Promise<{ fileName: string; mimeType: string | null; stream: Readable }> {
        const contract = await this.contractOf(contractId, companyId);
        if (!contract.signedFileUrl) throw new NotFoundException('Подписанный договор ещё не приложен');
        const fileName = contract.signedFileName || `Договор_${contract.contractNumber}`;

        if (this.s3Service.isS3Enabled()) {
            try {
                const { stream } = await this.s3Service.downloadFile(contract.signedFileUrl);
                return { fileName, mimeType: contract.signedFileMime, stream };
            } catch {
                // Ниже — попытка найти файл на диске.
            }
        }
        const absolutePath = path.join(process.cwd(), contract.signedFileUrl);
        if (!fs.existsSync(absolutePath)) throw new NotFoundException('Файл договора не найден');
        return { fileName, mimeType: contract.signedFileMime, stream: fs.createReadStream(absolutePath) };
    }

    async remove(contractId: string, companyId: string) {
        const contract = await this.contractOf(contractId, companyId);
        if (!contract.signedFileUrl) return { removed: false };
        await this.prisma.contract.update({
            where: { id: contractId },
            data: {
                signedFileUrl: null, signedFileName: null, signedFileMime: null,
                signedFileSize: null, signedUploadedAt: null,
            },
        });
        await this.removeStored(contract.signedFileUrl);
        return { removed: true };
    }

    private async removeStored(relativePath: string) {
        if (this.s3Service.isS3Enabled()) {
            await this.s3Service.deleteFile(relativePath);
            return;
        }
        const absolutePath = path.join(process.cwd(), relativePath);
        if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    }
}
