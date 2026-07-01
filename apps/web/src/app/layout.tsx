import type { Metadata } from 'next';
import { AntdProvider } from './providers';
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
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Inter:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <AntdProvider>{children}</AntdProvider>
            </body>
        </html>
    );
}
