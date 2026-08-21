import type { Config } from 'tailwindcss';

/**
 * Tailwind включён ради компонентов shadcn/ui — на них переезжает интерфейс.
 *
 * `preflight` ВЫКЛЮЧЕН намеренно. Это глобальный сброс стилей Tailwind: он
 * обнуляет заголовки, списки, кнопки и поля. В приложении 100+ экранов на
 * Ant Design и 2900 строк собственных стилей `lc-*` — с включённым
 * preflight они разъедутся все разом. Утилиты Tailwind и компоненты shadcn
 * работают и без него.
 *
 * Когда экраны на Ant Design закончатся, preflight можно будет включить —
 * но это отдельная задача с проверкой каждой страницы.
 */
const config: Config = {
    darkMode: ['class', '[data-theme="dark"]'],
    content: [
        './src/app/**/*.{ts,tsx}',
        './src/components/**/*.{ts,tsx}',
        './src/lib/**/*.{ts,tsx}',
    ],
    corePlugins: {
        preflight: false,
    },
    theme: {
        extend: {
            colors: {
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                },
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
                /**
                 * Всплывающие панели.
                 *
                 * Цвета не было ни здесь, ни в токенах, а базовый
                 * `PopoverContent` из shadcn красится классом `bg-popover`.
                 * Класса не существовало — панель выходила прозрачной, и
                 * сквозь неё читалось то, что под ней. Поломка тихая:
                 * разметка правильная, типы и сборка молчат.
                 */
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))',
                },
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            /**
             * Тени по спецификации владельца: чёрный на 5–6% прозрачности,
             * набранный слоями. Одна большая размытая тень даёт грязное
             * пятно; шесть коротких слоёв с удвоением расстояния читаются
             * как настоящая — у ближних краёв контакт, дальше мягкий спад.
             *
             * `soft` — набор без сжатия (spread 0), карточка кажется
             * приподнятой по всей площади.
             * `lift` — тот же набор с отрицательным сжатием: тень поджата к
             * центру, край чище. Для того, что висит над содержимым.
             */
            boxShadow: {
                soft:
                    '0 0 0 1px rgb(0 0 0 / 0.05), 0 1px 1px rgb(0 0 0 / 0.05), ' +
                    '0 2px 2px rgb(0 0 0 / 0.05), 0 4px 4px rgb(0 0 0 / 0.05), ' +
                    '0 8px 8px rgb(0 0 0 / 0.05), 0 16px 16px rgb(0 0 0 / 0.05)',
                lift:
                    '0 0 0 1px rgb(0 0 0 / 0.06), 0 1px 1px -0.5px rgb(0 0 0 / 0.06), ' +
                    '0 3px 3px -1.5px rgb(0 0 0 / 0.06), 0 6px 6px -3px rgb(0 0 0 / 0.06), ' +
                    '0 12px 12px -6px rgb(0 0 0 / 0.06), 0 24px 24px -12px rgb(0 0 0 / 0.06)',
            },
        },
    },
    plugins: [],
};

export default config;
