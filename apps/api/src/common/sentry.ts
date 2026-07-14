import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';

/**
 * Мониторинг ошибок. Включается только при заданной переменной SENTRY_DSN —
 * без неё все вызовы бесплатные no-op, поведение платформы не меняется.
 */
let enabled = false;
const logger = new Logger('Monitoring');

export function initSentry(): void {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        logger.log('SENTRY_DSN не задан — ошибки пишутся в логи Railway (без внешней панели)');
        return;
    }
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 0,
    });
    enabled = true;
    new Logger('Sentry').log('✅ Sentry подключён');
}

export function captureException(exception: unknown, context?: Record<string, any>): void {
    if (!enabled) {
        // Без Sentry — хотя бы в логи Railway, чтобы ошибки не терялись
        logger.error(exception instanceof Error ? exception.message : String(exception));
        return;
    }
    try {
        Sentry.captureException(exception, context ? { extra: context } : undefined);
    } catch {
        // мониторинг никогда не должен ломать основной поток
    }
}

export function captureClientError(payload: { message: string; stack?: string; url?: string; userId?: string }): void {
    if (!enabled) {
        // Без Sentry — пишем в логи Railway
        logger.warn(`[web] ${payload.message}${payload.url ? ` (${payload.url})` : ''}`);
        return;
    }
    try {
        Sentry.captureMessage(`[web] ${payload.message}`, {
            level: 'error',
            extra: { stack: payload.stack, url: payload.url, userId: payload.userId },
        });
    } catch {
        // no-op
    }
}
