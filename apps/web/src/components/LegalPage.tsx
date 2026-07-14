'use client';

import { useRouter } from 'next/navigation';

/**
 * Обёртка юридических страниц (политика, оферта): тёмная editorial-шапка
 * в стиле лендинга + светлая читабельная карточка с текстом документа.
 */
export default function LegalPage({ eyebrow, title, updated, children }: {
    eyebrow: string;
    title: string;
    updated: string;
    children: React.ReactNode;
}) {
    const router = useRouter();

    return (
        <div style={{ minHeight: '100vh', background: '#030712' }}>
            <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 64px' }}>
                <div
                    onClick={() => router.push('/')}
                    style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', cursor: 'pointer', marginBottom: 40 }}
                >
                    Logi<span style={{ color: '#1677ff' }}>Core</span>
                </div>

                <div style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.42)', marginBottom: 16,
                }}>
                    {eyebrow}
                </div>
                <h1 style={{
                    fontFamily: "'Unbounded', 'Inter', sans-serif", fontWeight: 700,
                    fontSize: 'clamp(24px, 3.4vw, 38px)', lineHeight: 1.1, letterSpacing: '-0.02em',
                    color: '#fff', margin: '0 0 10px',
                }}>
                    {title}
                </h1>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 28 }}>
                    Редакция от {updated}
                </div>

                <div className="lc-legal-doc">
                    {children}
                </div>
            </div>
        </div>
    );
}
