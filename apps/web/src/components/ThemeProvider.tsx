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
     * Тёмная тема — свойство кабинета: переключатель живёт только там, и
     * рисовались под неё только его экраны. Выбор сохранялся на всё
     * приложение, поэтому после выхода страницы входа и регистрации
     * доставались наполовину тёмными: поля ввода чёрные, фон карточки
     * белый, а подписи «Имя» и «Фамилия» — белым по белому, не видно.
     * Вне кабинета всегда светлая.
     */
    const isCabinet = !!pathname && (pathname.startsWith('/company') || pathname.startsWith('/admin'));
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