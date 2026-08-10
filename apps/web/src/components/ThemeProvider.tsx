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

/** Телефон и планшет на движке Safari — включая новые iPad, которые
 *  представляются Маком, и Chrome с Firefox на iPhone: движок там тот же. */
function isWebKitMobile() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Заставить Safari перечитать цвет полосы состояния.
 *
 * Он читает `theme-color` при загрузке и дальше держит прочитанное: смена
 * тега на живой странице панель не перекрашивает — цвет догонял тему
 * только после перезагрузки. Перечитывает он её, когда страница едет,
 * поэтому дёргаем прокрутку на одну точку и тем же кадром возвращаем
 * обратно. На глаз незаметно: положение то же, а панель перекрашивается.
 *
 * Короткую страницу дёрнуть некуда — ей на один кадр добавляем высоты,
 * иначе прокрутка стоит на нуле и ничего не происходит.
 */
function repaintStatusBar() {
    if (!isWebKitMobile()) return;

    const doc = document.documentElement;
    const y = window.scrollY;

    if (doc.scrollHeight > window.innerHeight + 1) {
        window.scrollTo(0, y === 0 ? 1 : y - 1);
        requestAnimationFrame(() => window.scrollTo(0, y));
        return;
    }

    const prev = doc.style.minHeight;
    doc.style.minHeight = `${window.innerHeight + 2}px`;
    window.scrollTo(0, 1);
    requestAnimationFrame(() => {
        window.scrollTo(0, y);
        doc.style.minHeight = prev;
    });
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
        repaintStatusBar();
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