'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { api } from '@/lib/api';
import { rememberAdClick } from '@/lib/signup-source';

/**
 * Мониторинг фронтенда:
 * 1) Необработанные JS-ошибки уходят на бэкенд (/monitoring/client-error),
 *    оттуда — в Sentry, если он настроен. Без настроек — просто тихо.
 * 2) Google Analytics и метка Google Рекламы подключаются только если задан
 *    NEXT_PUBLIC_GA_ID, то есть на рабочем сайте, а не на стендах.
 * 3) Переход с рекламы Google запоминается для раздела «Реклама» в админке.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/** Кабинет Google Рекламы LogiCore (783-001-8498). Номер открытый, он виден в коде страницы. */
const GOOGLE_ADS_ID = 'AW-18553265353';

/** Сюда человек попадает сразу после регистрации: по этой странице Google считает заявку. */
const SIGNUP_DONE_PATH = '/company/onboarding';

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
    const pathname = usePathname();
    const previousPathname = useRef(pathname);

    useEffect(() => {
        rememberAdClick();
    }, []);

    // Форма регистрации переходит дальше без перезагрузки страницы, а метка
    // Google сама видит только полную загрузку. Без этого сообщения Google не
    // узнал бы о регистрации. При полной загрузке метка считает страницу сама,
    // поэтому сообщаем только о переходе, иначе заявка посчиталась бы дважды.
    useEffect(() => {
        if (previousPathname.current === pathname) return;
        previousPathname.current = pathname;
        if (pathname !== SIGNUP_DONE_PATH) return;
        const { gtag } = window as unknown as { gtag?: (...args: unknown[]) => void };
        gtag?.('event', 'page_view', { send_to: GOOGLE_ADS_ID, page_location: window.location.href });
    }, [pathname]);

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
                        gtag('config', ${JSON.stringify(GA_ID)});
                        gtag('config', ${JSON.stringify(GOOGLE_ADS_ID)});`}
                    </Script>
                </>
            )}
        </>
    );
}
