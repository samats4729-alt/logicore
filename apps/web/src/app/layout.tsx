import type { Metadata } from 'next';
import { AntdProvider } from './providers';
import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/seo';
import ClientMonitoring from '@/components/ClientMonitoring';
import './globals.css';

// Значок сайта и картинка для превью ссылки лежат рядом файлами
// (`icon.svg`, `apple-icon.png`, `favicon.ico`, `opengraph-image.png`) —
// Next.js сам ставит на них ссылки на каждой странице.
export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: 'LogiCore - Система управления логистикой',
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: {
        type: 'website',
        siteName: SITE_NAME,
        locale: 'ru_RU',
        title: HOME_TITLE,
        description: SITE_DESCRIPTION,
    },
    twitter: { card: 'summary_large_image' },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ru">
            <head>
                {/* Цвет полосы состояния телефона — там, где часы и заряд.
                    Ставим его тем же кадром, что и тему: иначе в тёмной теме
                    верх экрана остаётся белым и выглядит как чужая полоса
                    поверх приложения. Значения те же, что у `--nova-bg`.

                    Тег заводит скрипт, а не разметка. Пока он стоял в
                    разметке, после гидратации на странице оказывалось два
                    тега сразу — свой, уже перекрашенный, и восстановленный
                    React'ом белый. Браузер брал не тот, и полоса меняла цвет
                    только после перезагрузки. */}
                <script dangerouslySetInnerHTML={{ __html: `try{var d=localStorage.getItem('lc_theme')==='dark';if(d)document.documentElement.setAttribute('data-theme','dark');var m=document.createElement('meta');m.setAttribute('name','theme-color');m.setAttribute('content',d?'#20201f':'#ffffff');document.head.appendChild(m)}catch(e){}` }} />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700;900&family=Inter:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <AntdProvider>{children}</AntdProvider>
                <ClientMonitoring />
            </body>
        </html>
    );
}