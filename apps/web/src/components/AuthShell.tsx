'use client';

import { useRouter } from 'next/navigation';

interface AuthShellProps {
    /** Индекс секции в языке лендинга, например «(01 — Вход)» */
    eyebrow: string;
    title: React.ReactNode;
    subtitle?: string;
    points?: string[];
    /** Ширина белой карточки формы */
    cardWidth?: number;
    children: React.ReactNode;
}

/**
 * Обёртка страниц входа/регистрации/восстановления в редакционном стиле
 * лендинга: тёмный фон #030712, Unbounded-заголовок слева, белая карточка
 * формы справа. Формы внутри не меняются — только окружение.
 */
export default function AuthShell({ eyebrow, title, subtitle, points, cardWidth = 440, children }: AuthShellProps) {
    const router = useRouter();

    return (
        <div className="lc-auth">
            <div className="lc-auth-side">
                <div className="lc-auth-brand" onClick={() => router.push('/')}>
                    Logi<span>Core</span>
                </div>
                <div>
                    <div className="lc-auth-eyebrow">{eyebrow}</div>
                    <h1 className="lc-auth-title">{title}</h1>
                    {subtitle && <p className="lc-auth-sub">{subtitle}</p>}
                    {points && points.length > 0 && (
                        <div className="lc-auth-points">
                            {points.map((p) => (
                                <div className="lc-auth-point" key={p}>{p}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="lc-auth-panel">
                <div className="lc-auth-card" style={{ maxWidth: cardWidth }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
