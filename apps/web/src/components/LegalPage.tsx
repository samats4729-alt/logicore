'use client';

import PublicHeader from '@/components/public/PublicHeader';
import styles from '@/components/public/public.module.css';

/**
 * Обёртка юридических страниц — оферты и политики конфиденциальности.
 *
 * Тот же язык, что на главной и в кабинете. Документ лежит в карточке с
 * рамкой, набран по ширине строки, за которой глаз не теряет начало
 * следующей: читать оферту приходится подряд, а не по диагонали.
 */
export default function LegalPage({ eyebrow, title, updated, children }: {
    eyebrow: string;
    title: string;
    updated: string;
    children: React.ReactNode;
}) {
    return (
        <div className={`lc-nova ${styles.root}`}>
            <PublicHeader action={{ label: 'На главную', href: '/' }} />

            <div className={styles.legalBody}>
                <div className={styles.eyebrow}>{eyebrow}</div>
                <h1 className={styles.legalTitle}>{title}</h1>
                <div className={styles.legalUpdated}>Редакция от {updated}</div>

                <div className={styles.doc}>
                    {children}
                </div>
            </div>

            <footer className={styles.foot}>
                <div className={styles.footBand}>
                    <div>© {new Date().getFullYear()} LogiCore · Казахстан</div>
                    <div>
                        <a href="/terms">Условия</a>
                        <a href="/privacy">Конфиденциальность</a>
                        <a href="/login">Войти</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
