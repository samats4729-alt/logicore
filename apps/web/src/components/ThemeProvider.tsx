'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
    theme: 'light',
    setTheme: () => {},
});

export function useTheme() {
    return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    /**
     * Тёмная тема живёт там, где под неё нарисованы экраны: кабинет,
     * админка, главная и публичные страницы — вход, регистрация,
     * восстановление пароля, оферта, конфиденциальность. У всех у них общая
     * обвязка на токенах `.lc-nova`, и обе темы разобраны до последней
     * плашки.
     *
     * Раньше вне кабинета тема принудительно гасилась в светлую: страницы
     * входа и регистрации под тёмную не рисовались, и сохранённый выбор
     * доставал их наполовину тёмными — поля ввода чёрные, фон карточки
     * белый, подписи белым по белому. Теперь они переехали на общий язык, и
     * запрет больше не нужен.
     *
     * Остальные страницы (приглашения, публичные ссылки на документы) под
     * тёмную не рисовались — там тема остаётся светлой.
     */
    const THEMED = ['/company', '/admin', '/login', '/register', '/forgot-password', '/reset-password', '/terms', '/privacy'];
    const isCabinet = !!pathname && (pathname === '/' || THEMED.some((p) => pathname.startsWith(p)));
    const [theme, setTheme] = useState<Theme>('light');

    useEffect(() => {
        let next: Theme = 'light';
        if (isCabinet) {
            try {
                next = localStorage.getItem('lc_theme') === 'dark' ? 'dark' : 'light';
            } catch {}
        }
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
    }, [isCabinet]);

    const handleSetTheme = (t: Theme) => {
        const el = document.documentElement;
        el.setAttribute('data-theme', t);
        // Плавное «переливание»: включаем анимацию на ~250ms, затем выключаем
        el.setAttribute('data-anim', 'on');
        setTimeout(() => el.removeAttribute('data-anim'), 250);

        setTheme(t);
        try { localStorage.setItem('lc_theme', t); } catch {}
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}