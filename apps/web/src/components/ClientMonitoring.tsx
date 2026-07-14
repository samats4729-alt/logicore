'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { api } from '@/lib/api';

/**
 * Мониторинг фронтенда:
 * 1) Необработанные JS-ошибки уходят на бэкенд (/monitoring/client-error),
 *    оттуда — в Sentry, если он настроен. Без настроек — просто тихо.
 * 2) Google Analytics подключается только если задан NEXT_PUBLIC_GA_ID.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

let reportedCount = 0;

function reportError(message: string, stack?: string) {
    // Не спамим: максимум 5 ошибок за сессию страницы
    if (reportedCount >= 5) return;
    reportedCount += 1;
    api.post('/monitoring/client-error', {
        message,
        stack,
        url: typeof window !== 'undefined' ? window.location.href : '',
    }).catch(() => { });
}

export default function ClientMonitoring() {
    useEffect(() => {
        const onError = (event: ErrorEvent) => {
            reportError(event.message || 'Unhandled error', event.error?.stack);
        };
        const onRejection = (event: PromiseRejectionEvent) => {
            const reason: any = event.reason;
            // Ошибки API (axios) не шлём — они уже видны на бэкенде
            if (reason?.isAxiosError) return;
            reportError(reason?.message || 'Unhandled promise rejection', reason?.stack);
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);

    return (
        <>
            {GA_ID && (
                <>
                    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
                    <Script id="google-analytics" strategy="afterInteractive">
                        {`window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
                        gtag('config', ${JSON.stringify(GA_ID)});`}
                    </Script>
                </>
            )}
        </>
    );
}
