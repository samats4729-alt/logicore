import * as fs from 'fs';
import * as path from 'path';
import { S3Service } from '../s3/s3.service';

/**
 * Файл из хранилища целиком — для вложения в письмо. Сначала S3, при его
 * отсутствии или ошибке — локальная папка. Нет файла — null.
 */
export async function readStoredFile(s3: S3Service, relativePath: string): Promise<Buffer | null> {
    if (s3.isS3Enabled()) {
        try {
            const { stream } = await s3.downloadFile(relativePath);
            return await new Promise<Buffer>((resolve, reject) => {
                const chunks: Buffer[] = [];
                stream.on('data', (chunk) => chunks.push(chunk as Buffer));
                stream.on('end', () => resolve(Buffer.concat(chunks)));
                stream.on('error', reject);
            });
        } catch {
            /* ниже — локальная копия */
        }
    }
    const local = path.join(process.cwd(), relativePath);
    return fs.existsSync(local) ? fs.readFileSync(local) : null;
}
