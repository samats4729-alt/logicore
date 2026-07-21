'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    TeamOutlined,
    SettingOutlined,
    FileProtectOutlined,
    RightOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface CabinetItem {
    key: string;
    href: string;
    icon: React.ReactNode;
    title: string;
    desc: string;
}

export default function CabinetPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [auditEnabled, setAuditEnabled] = useState(false);

    const isAdmin = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');

    useEffect(() => {
        api.get('/audit/status')
            .then(res => setAuditEnabled(!!res.data?.companiesEnabled))
            .catch(() => setAuditEnabled(false));
    }, []);

    const items: CabinetItem[] = [];

    if (isAdmin) {
        items.push({
            key: 'users',
            href: '/company/users',
            icon: <TeamOutlined />,
            title: 'Сотрудники',
            desc: 'Команда, отделы, права доступа и водители',
        });
    }

    items.push({
        key: 'settings',
        href: '/company/settings',
        icon: <SettingOutlined />,
        title: 'Настройки',
        desc: isAdmin ? 'Профиль, организации, реквизиты, печать и подпись' : 'Личные данные и смена пароля',
    });

    if (isAdmin && auditEnabled) {
        items.push({
            key: 'audit',
            href: '/company/audit',
            icon: <FileProtectOutlined />,
            title: 'Журнал действий',
            desc: 'Кто, что и когда менял в компании',
        });
    }

    return (
        <div className="lc-page" style={{ maxWidth: 720, margin: '0 auto' }}>
            <div className="lc2-hero" style={{ marginBottom: 20 }}>
                <div>
                    <div className="lc-eyebrow">Кабинет</div>
                    <h1 className="lc2-title">Управление компанией</h1>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map(it => (
                    <button
                        key={it.key}
                        type="button"
                        onClick={() => router.push(it.href)}
                        className="lc-cabinet-row"
                    >
                        <span className="lc2-mic"><span style={{ fontSize: 16 }}>{it.icon}</span></span>
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--lc-text)' }}>{it.title}</span>
                            <span style={{ display: 'block', fontSize: 12, color: 'var(--lc-text-ter)', marginTop: 2 }}>{it.desc}</span>
                        </span>
                        <RightOutlined style={{ fontSize: 12, color: 'var(--lc-text-ter)' }} />
                    </button>
                ))}
            </div>

            <style jsx>{`
                .lc-cabinet-row {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    width: 100%;
                    padding: 14px 16px;
                    background: var(--lc-card);
                    border: 1px solid var(--lc-border);
                    border-radius: 14px;
                    cursor: pointer;
                    transition: border-color .15s ease, background .15s ease, transform .15s ease;
                }
                .lc-cabinet-row:hover {
                    border-color: var(--lc-primary, #1677ff);
                    background: var(--lc-hover);
                    transform: translateY(-1px);
                }
            `}</style>
        </div>
    );
}
