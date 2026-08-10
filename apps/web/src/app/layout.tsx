import type { Metadata } from 'next';
import { AntdProvider } from './providers';
import ClientMonitoring from '@/components/ClientMonitoring';
import './globals.css';

export const metadata: Metadata = {
    title: 'LogiCore - Система управления логистикой',
    description: 'Управление перевозками, отслеживание грузов, документооборот',
    icons: {
        icon: '/favicon.png',
    },
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
                    поверх приложения. Значения те же, что у `--nova-bg`. */}
                <meta name="theme-color" content="#ffffff" />
                <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('lc_theme')==='dark';if(t){document.documentElement.setAttribute('data-theme','dark');var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content','#20201f')}}catch(e){}` }} />
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