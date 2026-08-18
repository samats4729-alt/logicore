import { BadRequestException } from '@nestjs/common';
import {
    assertAllowedUpload,
    fileResponseHeaders,
    safeContentType,
} from './allowed-files';

/**
 * Что принимаем и как отдаём.
 *
 * Загрузка не проверяла тип, а раздача отдавала файл с типом по расширению
 * и без пометки «сохранить». Через публичную ссылку водителя — её
 * пересылают в мессенджере — грузился обычный `.html`, и браузер исполнял
 * его на домене нашего API, где лежит куки сессии. Чужой скрипт работал от
 * имени того, кто открыл «накладную»: бухгалтера, логиста, владельца.
 *
 * Доказано на стенде до починки: загрузил evil.html по ссылке водителя,
 * скачал через журнал — «Content-Type: text/html» и скрипт в теле.
 *
 * Защит две, и нужны обе: список типов на входе и безопасная раздача на
 * выходе. Одного списка мало — тип приходит от отправителя, а старые файлы
 * лежат какие есть.
 */
describe('Приложенные файлы: что принимаем и как отдаём', () => {
    const файл = (over: Partial<Express.Multer.File> = {}) => ({
        originalname: 'ttn.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        ...over,
    }) as Express.Multer.File;

    describe('на входе', () => {
        it('накладная в PDF проходит', () => {
            expect(() => assertAllowedUpload(файл())).not.toThrow();
        });

        it('фотография с телефона проходит', () => {
            expect(() => assertAllowedUpload(файл({ mimetype: 'image/heic' }))).not.toThrow();
        });

        it('HTML не проходит', () => {
            expect(() => assertAllowedUpload(файл({
                originalname: 'evil.html', mimetype: 'text/html',
            }))).toThrow(BadRequestException);
        });

        it('SVG не проходит: это XML со скриптами внутри', () => {
            expect(() => assertAllowedUpload(файл({
                originalname: 'logo.svg', mimetype: 'image/svg+xml',
            }))).toThrow(BadRequestException);
        });

        it('в отказе сказано, что подойдёт', () => {
            // Человеку посреди работы нужен следующий шаг, а не «нельзя».
            expect(() => assertAllowedUpload(файл({ mimetype: 'text/html' })))
                .toThrow(/PDF или фотография/);
        });

        it('слишком большой файл не проходит', () => {
            expect(() => assertAllowedUpload(файл({ size: 20 * 1024 * 1024 })))
                .toThrow(/15 МБ/);
        });
    });

    describe('на выходе', () => {
        it('знакомый тип называется своим именем', () => {
            expect(safeContentType('application/pdf')).toBe('application/pdf');
        });

        it('незнакомый становится потоком байтов', () => {
            // Старые файлы лежат с чем угодно: отдать их надо, но не страницей.
            expect(safeContentType('text/html')).toBe('application/octet-stream');
            expect(safeContentType('image/svg+xml')).toBe('application/octet-stream');
            expect(safeContentType(null)).toBe('application/octet-stream');
        });

        it('тип с довеском разбирается правильно', () => {
            expect(safeContentType('application/pdf; charset=utf-8')).toBe('application/pdf');
        });

        it('файл уходит вложением и без угадывания типа', () => {
            const headers = fileResponseHeaders('ttn.pdf', 'application/pdf');

            expect(headers['Content-Disposition']).toMatch(/^attachment;/);
            expect(headers['X-Content-Type-Options']).toBe('nosniff');
        });

        it('HTML отдаётся так, что не выполнится', () => {
            const headers = fileResponseHeaders('evil.html', 'text/html');

            expect(headers['Content-Type']).toBe('application/octet-stream');
            expect(headers['Content-Disposition']).toMatch(/^attachment;/);
        });

        it('кириллица в имени файла сохраняется', () => {
            // Без второго написания накладная скачивается вопросительными
            // знаками вместо имени.
            const headers = fileResponseHeaders('накладная.pdf', 'application/pdf');

            expect(headers['Content-Disposition']).toContain("filename*=UTF-8''");
            expect(headers['Content-Disposition']).toContain(encodeURIComponent('накладная.pdf'));
        });

        it('кавычки в имени не ломают заголовок', () => {
            const headers = fileResponseHeaders('a"; drop.pdf', 'application/pdf');
            const quoted = headers['Content-Disposition'].match(/filename="([^"]*)"/);

            expect(quoted?.[1]).not.toContain('"');
        });
    });
});
