import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';
import { S3Service } from '../s3/s3.service';
import { fileResponseHeaders } from '../documents/allowed-files';

/**
 * Файлы биржи — фото грузов и документы водителей.
 *
 * Лежат в S3, а если он не настроен (стенд разработчика) — в папке uploads.
 * Одно место на всю биржу, чтобы грузы и водители не разошлись в том, куда
 * и как кладут файлы.
 */
export async function storeExchangeFile(s3: S3Service, key: string, file: Express.Multer.File) {
    if (s3.isS3Enabled()) {
        await s3.uploadFile(key, file.buffer, file.mimetype);
        return;
    }
    const absolute = path.join(process.cwd(), key);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, file.buffer);
}

/** Файл уже не нужен. Не удалился — не беда: запись о нём уже стёрта. */
export async function removeExchangeFile(s3: S3Service, key: string) {
    try {
        if (s3.isS3Enabled()) await s3.deleteFile(key);
        else fs.rmSync(path.join(process.cwd(), key), { force: true });
    } catch { /* мусор в хранилище никому не мешает */ }
}

/** Отдать файл вложением — без права браузера угадывать тип (см. documents.controller). */
export async function sendExchangeFile(
    s3: S3Service,
    res: Response,
    file: { fileKey: string; fileName: string; mimeType: string },
) {
    res.set(fileResponseHeaders(file.fileName, file.mimeType));
    if (s3.isS3Enabled()) {
        const { stream } = await s3.downloadFile(file.fileKey);
        return stream.pipe(res);
    }
    const absolute = path.join(process.cwd(), file.fileKey);
    if (!fs.existsSync(absolute)) return res.status(404).json({ message: 'Файл не найден' });
    return fs.createReadStream(absolute).pipe(res);
}

/** Расширение из имени файла — только буквы и цифры, по умолчанию «.jpg». */
export function safeExtension(fileName?: string | null): string {
    return path.extname(fileName || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
}
