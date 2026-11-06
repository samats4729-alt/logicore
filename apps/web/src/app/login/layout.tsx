import type { Metadata } from 'next';

// Сама страница входа работает в браузере, а заголовок для поиска и
// вкладки задаётся только на сервере — поэтому он здесь.
export const metadata: Metadata = {
    title: 'Вход — LogiCore',
    alternates: { canonical: '/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
