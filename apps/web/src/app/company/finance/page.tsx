'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

interface Link {
    label: string;
    href: string;
    show: boolean;
}
interface Group {
    title: string;
    links: Link[];
}

export default function FinanceHubPage() {
    const router = useRouter();
    const { user } = useAuthStore();

    const isAdmin = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    const hasPerm = (perm: string) => isAdmin || (user?.permissions || []).includes(perm);
    const acc = hasPerm('accounting');

    const groups: Group[] = [
        {
            title: 'Операции',
            links: [
                { label: 'Счета', href: '/company/accounting/invoices', show: acc },
                { label: 'Поступления', href: '/company/accounting/incomes', show: acc },
                { label: 'Расходы', href: '/company/accounting/expenses', show: acc },
                { label: 'Реестр заявок', href: '/company/accounting/registry', show: acc },
            ],
        },
        {
            title: 'Отчёты',
            links: [
                { label: 'Бухгалтерия', href: '/company/accounting', show: acc },
                { label: 'ДДС', href: '/company/accounting/cashflow', show: acc },
                { label: 'P&L', href: '/company/accounting/pnl', show: acc },
                { label: 'Взаиморасчёты', href: '/company/accounting/counterparty-report', show: acc },
                { label: 'Отчёты', href: '/company/reports', show: acc },
            ],
        },
        {
            title: 'Инструменты',
            links: [
                { label: 'Зарплата', href: '/company/payroll', show: acc && isAdmin },
                { label: 'Моя зарплата', href: '/company/my-salary', show: user?.role === 'LOGISTICIAN' },
                { label: 'Калькулятор', href: '/company/calculator', show: true },
                { label: 'Статьи доходов и расходов', href: '/company/accounting/settings', show: acc },
            ],
        },
    ]
        .map(g => ({ ...g, links: g.links.filter(l => l.show) }))
        .filter(g => g.links.length > 0);

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="lc2-hero" style={{ marginBottom: 24 }}>
                <div>
                    <div className="lc-eyebrow">Финансы</div>
                    <h1 className="lc2-title">Учёт и финансы компании</h1>
                </div>
            </div>

            <div className="lc-cabinet-grid">
                {groups.map(g => (
                    <div key={g.title} className="lc-cabinet-group">
                        <div className="lc-cabinet-group-title">{g.title}</div>
                        <ul className="lc-cabinet-links">
                            {g.links.map(l => (
                                <li key={l.label}>
                                    <button type="button" onClick={() => router.push(l.href)}>
                                        {l.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            <style jsx>{`
                .lc-cabinet-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
                    gap: 28px 40px;
                }
                .lc-cabinet-group-title {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--lc-text-ter);
                    padding-bottom: 8px;
                    margin-bottom: 8px;
                    border-bottom: 1px solid var(--lc-border);
                }
                .lc-cabinet-links {
                    list-style: none;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .lc-cabinet-links button {
                    background: none;
                    border: none;
                    padding: 6px 8px;
                    margin: 0 -8px;
                    width: calc(100% + 16px);
                    text-align: left;
                    font-size: 13.5px;
                    color: var(--lc-text-sec);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background .12s ease, color .12s ease;
                }
                .lc-cabinet-links button:hover {
                    background: var(--lc-hover);
                    color: var(--lc-primary, #1677ff);
                }
            `}</style>
        </div>
    );
}
