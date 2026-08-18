import { BadRequestException } from '@nestjs/common';

/**
 * Что можно приложить к рейсу и как это потом отдавать.
 *
 * Загрузка не проверяла тип файла, а скачивание отдавало его с
 * Content-Type по расширению и без пометки «сохранить». Через публичную
 * ссылку водителя — её пересылают в мессенджере, и попасть она может
 * кому угодно — грузился обычный `.html`, а браузер потом исполнял его на
 * домене нашего API, где лежит куки сессии. То есть чужой скрипт работал
 * от имени того, кто открыл «накладную»: бухгалтера, логиста, владельца.
 *
 * Отсюда две защиты, и нужны обе. Список разрешённых типов отсекает
 * очевидное на входе, но одного его мало: тип приходит от отправителя, и
 * ему верить нельзя. Поэтому файл всегда отдаётся вложением и с запретом
 * угадывать тип — тогда даже пропущенный HTML не выполнится, а
 * скачается.
 */

/** Накладные, акты, счета — то, что прикладывают к перевозке. */
export const ALLOWED_UPLOAD_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp',
];

/**
 * Типы, которые браузеру безопасно назвать своими именами.
 *
 * SVG сюда не входит намеренно: это XML со скриптами внутри, и как
 * картинку его показывать нельзя.
 */
const SAFE_CONTENT_TYPES = new Set(ALLOWED_UPLOAD_MIME_TYPES);

export const MAX_UPLOAD_SIZE = 15 * 1024 * 1024;

/** Проверка на входе: тип и размер. */
export function assertAllowedUpload(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Приложите файл');
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
        throw new BadRequestException(
            'Подойдёт PDF или фотография (JPG, PNG, HEIC, WebP). Другие файлы к рейсу не прикладывают.',
        );
    }
    if (file.size > MAX_UPLOAD_SIZE) {
        throw new BadRequestException('Файл больше 15 МБ — сожмите или снимите заново');
    }
}

/**
 * Тип для ответа: своё имя — только знакомым, остальным «поток байтов».
 *
 * Незнакомый тип не ошибка: старые файлы лежат с чем угодно, и отдавать
 * их надо, просто не как страницу.
 */
export function safeContentType(mimeType?: string | null): string {
    const value = (mimeType || '').toLowerCase().split(';')[0].trim();
    return SAFE_CONTENT_TYPES.has(value) ? value : 'application/octet-stream';
}

/**
 * Заголовки раздачи файла.
 *
 * `attachment` — файл сохраняется, а не открывается в окне; `nosniff` —
 * браузер не пытается угадать тип по содержимому и не превращает
 * «поток байтов» обратно в страницу.
 *
 * Имя файла пишется дважды: обычной строкой для старых браузеров и в
 * `filename*` — для кириллицы, иначе накладная сохраняется набором
 * вопросительных знаков.
 */
export function fileResponseHeaders(fileName?: string | null, mimeType?: string | null) {
    const fallback = (fileName || 'file').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
    return {
        'Content-Type': safeContentType(mimeType),
        'Content-Disposition':
            `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName || 'file')}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
    };
}
