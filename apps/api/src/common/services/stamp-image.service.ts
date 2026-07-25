import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { S3Service } from '../../s3/s3.service';

/**
 * Загрузка картинок печати и подписи компании для печатных форм.
 *
 * Вынесено в общий сервис, потому что правило одно для всех документов:
 * печать ставится только своей стороне и только по явному запросу. Раньше
 * загрузка была скопирована в договоре и доверенности, и правило в каждой
 * копии приходилось бы соблюдать заново.
 */
@Injectable()
export class StampImageService {
    private readonly logger = new Logger(StampImageService.name);

    constructor(private readonly s3Service: S3Service) {}

    /**
     * Печать и подпись компании, если печать вообще разрешена вызовом.
     *
     * `allowed` — решение вызывающего кода: запрошен ли флажок и наша ли
     * это сторона. При `false` изображения не загружаются вовсе, чтобы
     * чужая печать физически не могла попасть в буфер документа.
     */
    async loadFor(
        company: { id: string; stampImage?: string | null; signatureImage?: string | null } | null | undefined,
        allowed: boolean,
    ): Promise<{ stamp: Buffer | null; signature: Buffer | null }> {
        if (!allowed || !company) return { stamp: null, signature: null };
        const [stamp, signature] = await Promise.all([
            company.stampImage ? this.read(company.stampImage) : Promise.resolve(null),
            company.signatureImage ? this.read(company.signatureImage) : Promise.resolve(null),
        ]);
        return { stamp, signature };
    }

    private async read(relativePath: string): Promise<Buffer | null> {
        if (this.s3Service.isS3Enabled()) {
            try {
                const { stream } = await this.s3Service.downloadFile(relativePath);
                return await new Promise<Buffer>((resolve, reject) => {
                    const chunks: Buffer[] = [];
                    stream.on('data', (chunk) => chunks.push(chunk as Buffer));
                    stream.on('end', () => resolve(Buffer.concat(chunks)));
                    stream.on('error', reject);
                });
            } catch (error: any) {
                this.logger.warn(`Не удалось скачать ${relativePath} из S3: ${error.message}`);
            }
        }

        const localPath = path.join(process.cwd(), relativePath);
        if (!fs.existsSync(localPath)) {
            this.logger.warn(`Файл печати не найден: ${localPath}`);
            return null;
        }
        try {
            return fs.readFileSync(localPath);
        } catch (error) {
            this.logger.error(`Не удалось прочитать ${localPath}`, error as Error);
            return null;
        }
    }
}
