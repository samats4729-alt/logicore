'use client';

import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';
import PublicHeader from '@/components/public/PublicHeader';
import styles from '@/components/public/public.module.css';

interface AuthShellProps {
    /** Надстрочная строка, например «(01 — Вход)» */
    eyebrow: string;
    title: React.ReactNode;
    subtitle?: string;
    points?: string[];
    /** Ширина карточки формы */
    cardWidth?: number;
    children: React.ReactNode;
}

/**
 * Обёртка входа, регистрации и восстановления пароля.
 *
 * Тот же язык, что на главной и в кабинете: токены `.lc-nova`, шапка 58,
 * карточка с рамкой и тенью. Раньше эти страницы стояли на чёрном фоне и
 * между главной и кабинетом выглядели как чужой сайт.
 *
 * Формы внутри не трогаем — меняется только окружение. Вид полей Ant Design
 * приводится к общему языку стилями карточки.
 */
export default function AuthShell({ eyebrow, title, subtitle, points, cardWidth = 460, children }: AuthShellProps) {
    const pathname = usePathname();

    // На входе зовём регистрироваться, на остальных — войти.
    const action = pathname === '/login'
        ? { label: 'Зарегистрироваться', href: '/register' }
        : { label: 'Войти', href: '/login' };

    return (
        <div className={`lc-nova ${styles.root}`}>
            <PublicHeader action={action} />

            <div className={styles.authBody}>
                <div className={styles.side}>
                    <div className={styles.eyebrow}>{eyebrow}</div>
                    <h1 className={styles.sideTitle}>{title}</h1>
                    {subtitle && <p className={styles.sideText}>{subtitle}</p>}
                    {points && points.length > 0 && (
                        <ul className={styles.points}>
                            {points.map((p) => (
                                <li key={p}><Check size={14} className={styles.tick} />{p}</li>
                            ))}
                        </ul>
                    )}
                </div>

                <div>
                    <div className={styles.card} style={{ maxWidth: cardWidth }}>
                        {children}
                    </div>
                    <div className={styles.legalNote}>
                        Продолжая, вы принимаете <a href="/terms">условия оферты</a>
                        {' '}и <a href="/privacy">политику конфиденциальности</a>
                    </div>
                </div>
            </div>

            <footer className={styles.foot}>
                <div className={styles.footBand}>
                    <div>© {new Date().getFullYear()} LogiCore · Казахстан</div>
                    <div>
                        <a href="/terms">Условия</a>
                        <a href="/privacy">Конфиденциальность</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
