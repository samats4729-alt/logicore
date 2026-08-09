'use client';

import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import styles from './public.module.css';

/**
 * Шапка публичных страниц: вход, регистрация, восстановление пароля,
 * оферта, конфиденциальность.
 *
 * Та же, что на главной, — логотип, переключатель темы и одна кнопка
 * действия. Человек не должен по дороге между главной и кабинетом
 * попадать на страницы, выглядящие как чужой сайт.
 */
export default function PublicHeader({ action }: { action?: { label: string; href: string } }) {
    const router = useRouter();
    const { theme, setTheme } = useTheme();

    return (
        <header className={styles.head}>
            <div className={styles.headBand}>
                <button type="button" className={styles.brand} onClick={() => router.push('/')}>
                    Logi<span>Core</span>
                </button>

                <div className={styles.headRight}>
                    <button
                        type="button"
                        className={styles.themeBtn}
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                        title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                    >
                        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                    </button>

                    {action && (
                        <button type="button" className={styles.headLink} onClick={() => router.push(action.href)}>
                            {action.label}
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
