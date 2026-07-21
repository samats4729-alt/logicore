'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
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

export default function CabinetPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [auditEnabled, setAuditEnabled] = useState(false);

    const isAdmin = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    const hasPerm = (perm: string) => isAdmin || (user?.permissions || []).includes(perm);

    useEffect(() => {
        api.get('/audit/status')
            .then(res => setAuditEnabled(!!res.data?.companiesEnabled))
            .catch(() => setAuditEnabled(false));
    }, []);

    const groups: Group[] = [
        {
            title: 'Мои организации',
            links: [
                { label: 'Мои организации', href: '/company/settings', show: isAdmin },
            ],
        },
        {
            title: 'Сотрудники',
            links: [
                { label: 'Список сотрудников', href: '/company/users', show: isAdmin },
                { label: 'Права доступа', href: '/company/users?rights=1', show: isAdmin },
                { label: 'Водители', href: '/company/users?segment=drivers', show: isAdmin },
            ],
        },
        {
            title: 'Справочники',
            links: [
                { label: 'Контрагенты', href: '/company/partners', show: hasPerm('partners') },
                { label: 'Договоры', href: '/company/contracts', show: hasPerm('partners') },
                { label: 'Адреса', href: '/company/locations', show: true },
                { label: 'Автопарк', href: '/company/vehicles', show: isAdmin },
                { label: 'Документы', href: '/company/documents', show: hasPerm('documents') },
            ],
        },
        {
            title: 'Аккаунт',
            links: [
                { label: 'Мой профиль', href: '/company/profile', show: true },
                { label: 'Изменить пароль', href: '/company/profile', show: true },
            ],
        },
        {
            title: 'Журнал и контроль',
            links: [
                { label: 'Журнал действий', href: '/company/audit', show: isAdmin && auditEnabled },
            ],
        },
    ]
        .map(g => ({ ...g, links: g.links.filter(l => l.show) }))
        .filter(g => g.links.length > 0);

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="lc2-hero" style={{ marginBottom: 24 }}>
                <div>
                    <div className="lc-eyebrow">Кабинет</div>
                    <h1 className="lc2-title">Управление компанией</h1>
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
