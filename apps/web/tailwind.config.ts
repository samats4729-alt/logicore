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
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
        },
    },
    plugins: [],
};

export default config;
