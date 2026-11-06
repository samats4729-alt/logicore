import type { MetadataRoute } from 'next';
import { PUBLIC_PATHS, SITE_URL } from '@/lib/seo';

/**
 * Карта сайта — список страниц, которые стоит показывать в поиске.
 * Google и Яндекс находят её по ссылке из `robots.txt`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return PUBLIC_PATHS.map((path) => ({
        url: `${SITE_URL}${path === '/' ? '' : path}`,
        changeFrequency: path === '/' ? 'weekly' : 'monthly',
        priority: path === '/' ? 1 : 0.5,
    }));
}
