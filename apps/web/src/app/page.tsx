import type { Metadata } from 'next';
import HomeLanding, { type Tariff } from './HomeLanding';
import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';

/**
 * Главная. Собирается на сервере, поэтому поисковик и превью ссылки в
 * мессенджере сразу видят текст и цену, а не пустую страницу с
 * «Загрузкой». Сама вёрстка и поведение — в `HomeLanding`.
 *
 * Цену тарифа владелец меняет в админке. Готовая страница обновляется
 * раз в 5 минут, а в браузере цена всё равно запрашивается заново.
 */
export const revalidate = 300;

export const metadata: Metadata = {
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        siteName: SITE_NAME,
        locale: 'ru_RU',
        url: '/',
        title: HOME_TITLE,
        description: SITE_DESCRIPTION,
    },
};

async function loadTariff(): Promise<Tariff | null> {
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) return null;
    try {
        // Сервер цен не отвечает — главная всё равно открывается: без цены,
        // как было до этого, пока не ответит запрос из браузера.
        const res = await fetch(`${api}/public/billing/tariff`, {
            next: { revalidate },
            signal: AbortSignal.timeout(3000),
        });
        return res.ok ? ((await res.json()) as Tariff) : null;
    } catch {
        return null;
    }
}

export default async function HomePage() {
    return <HomeLanding initialTariff={await loadTariff()} />;
}
