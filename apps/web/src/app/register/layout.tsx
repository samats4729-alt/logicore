import type { Metadata } from 'next';

// Сама страница регистрации работает в браузере, а заголовок для поиска и
// вкладки задаётся только на сервере — поэтому он здесь.
export const metadata: Metadata = {
    title: 'Регистрация компании — LogiCore',
    alternates: { canonical: '/register' },
};

// Страница читает адресную строку (пришёл ли человек через вход Google). Собранная
// заранее, она отдавала поисковику одно слово «Загрузка»; собранная на
// каждый заход — сразу всю форму.
export const dynamic = 'force-dynamic';

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
    return children;
}
