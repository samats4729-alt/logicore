import type { MetadataRoute } from 'next';
import { PRIVATE_PATHS, SITE_URL } from '@/lib/seo';

/**
 * Правила для поисковиков: открытые страницы — можно, кабинеты и ссылки
 * «поделиться документом» — нет. В тех ссылках документы клиентов, им не
 * место в поиске.
 *
 * Cloudflare дописывает к этому файлу свой блок (запрет обучать ИИ на
 * текстах сайта). Это его настройка, здесь её не трогаем.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: [...PRIVATE_PATHS],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
