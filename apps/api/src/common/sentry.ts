import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';

/**
 * Мониторинг ошибок. Включается только при заданной переменной SENTRY_DSN —
 * без неё все вызовы бесплатные no-op, поведение платформы не меняется.
 */
let enabled = false;

export function initSentry(): void {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        new Logger('Sentry').log('SENTRY_DSN не задан — мониторинг ошибок выключен');
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
    if (!enabled) return;
    try {
        Sentry.captureException(exception, context ? { extra: context } : undefined);
    } catch {
        // мониторинг никогда не должен ломать основной поток
    }
}

export function captureClientError(payload: { message: string; stack?: string; url?: string; userId?: string }): void {
    if (!enabled) return;
    try {
        Sentry.captureMessage(`[web] ${payload.message}`, {
            level: 'error',
            extra: { stack: payload.stack, url: payload.url, userId: payload.userId },
        });
    } catch {
        // no-op
    }
}
