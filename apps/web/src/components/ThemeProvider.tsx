'use client';

import { createContext, useContext, useState, useEffect, startTransition, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
    theme: 'light',
    setTheme: () => {},
});

export function useTheme() {
    return useContext(ThemeContext);
}

/** Цвет полосы состояния телефона — тот же, что фон страницы. */
const BAR = { light: '#ffffff', dark: '#20201f' };

/**
 * Применить тему к документу.
 *
 * Кроме атрибута, от которого пляшут все цвета, переставляем `theme-color`:
 * им телефон красит полосу с часами и зарядом. Без этого в тёмной теме верх
 * экрана оставался белым, и над чёрной страницей висела светлая полоса.
 *
 * Тег не правим, а заводим заново. Во-первых, их может оказаться больше
 * одного — тогда браузер возьмёт не тот, и полоса останется прежней.
 * Во-вторых, Safari на телефоне перечитывает цвет надёжнее, когда тег
 * появился заново, а не сменил значение на месте.
 */
function applyTheme(t: Theme) {
    document.documentElement.setAttribute('data-theme', t);
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', BAR[t]);
    document.head.appendChild(meta);
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
        applyTheme(next);
    }, [isCabinet]);

    const handleSetTheme = (t: Theme) => {
        // Атрибут ставим первым делом: цвета в стилях привязаны к нему, и
        // страница перекрашивается тем же кадром. Раньше здесь ещё
        // включалась анимация перелива на четверть секунды — она и создавала
        // ощущение задержки, см. `globals.css`.
        applyTheme(t);
        try { localStorage.setItem('lc_theme', t); } catch { }

        // Состояние обновляем отложенно. От него зависит Ant Design: при
        // первом переключении он пересобирает весь свой набор стилей под
        // тёмную тему — почти треть секунды. Срочное обновление задержало бы
        // на это время саму перекраску, хотя она уже готова. Отложенное
        // пропускает браузер вперёд: страница меняет цвет сразу, а элементы
        // Ant Design догоняют следующим кадром.
        startTransition(() => setTheme(t));
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}