import type { Metadata } from 'next';
import { AntdProvider } from './providers';
import './globals.css';

export const metadata: Metadata = {
    title: 'LogiCore - Система управления логистикой',
    description: 'Управление перевозками, отслеживание грузов, документооборот',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ru">
            <body>
                <AntdProvider>{children}</AntdProvider>
            </body>
        </html>
    );
}
