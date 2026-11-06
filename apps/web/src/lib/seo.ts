/**
 * Как сайт представляется поисковикам и мессенджерам: адрес, название,
 * описание. Одно место, чтобы заголовок в Google, превью ссылки в WhatsApp
 * и карта сайта не разъезжались.
 *
 * Описание — то, что Google показывает серым под ссылкой. Держим его
 * около 150 знаков: длиннее он обрезает. Обещать в нём можно только то,
 * что есть на главной: оферта и главная не должны расходиться.
 */
export const SITE_URL = 'https://logicore.kz';
export const SITE_NAME = 'LogiCore';

export const HOME_TITLE = 'LogiCore — CRM для грузоперевозок и логистики в Казахстане';
export const SITE_DESCRIPTION =
    'Система для перевозчиков и экспедиторов Казахстана: заявки, биржа грузов, ' +
    'GPS-мониторинг рейсов, счета, акты и взаиморасчёты в одном окне.';

/**
 * Страницы, которые поисковик может показывать. Всё остальное — кабинеты
 * за входом и ссылки «поделиться документом», им в поиске не место
 * (`robots.ts` закрывает их от обхода).
 */
export const PUBLIC_PATHS = ['/', '/register', '/login', '/terms', '/privacy'] as const;

export const PRIVATE_PATHS = [
    '/admin',
    '/company',
    '/driver',
    '/billing',
    '/invite',
    '/park-invite',
    '/shared',
    '/reset-password',
    '/forgot-password',
] as const;
