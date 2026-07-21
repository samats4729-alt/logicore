'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Typography } from 'antd';
import {
    TeamOutlined,
    SettingOutlined,
    FileProtectOutlined,
    UserOutlined,
    ArrowRightOutlined,
    ApartmentOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const { Text } = Typography;

interface CabinetCard {
    key: string;
    href: string;
    icon: React.ReactNode;
    title: string;
    desc: string;
    bg: string;
    fg: string;
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

    const cards: CabinetCard[] = [];

    if (isAdmin) {
        cards.push({
            key: 'users',
            href: '/company/users',
            icon: <TeamOutlined />,
            title: 'Сотрудники',
            desc: 'Команда, отделы, роли и права доступа, водители',
            bg: '#e0f2fe', fg: '#0369a1',
        });
    }

    cards.push({
        key: 'settings',
        href: '/company/settings',
        icon: <SettingOutlined />,
        title: 'Настройки',
        desc: isAdmin ? 'Профиль, организации, реквизиты, печать и подпись' : 'Личные данные и смена пароля',
        bg: '#eef2ff', fg: '#4f46e5',
    });

    if (isAdmin && auditEnabled) {
        cards.push({
            key: 'audit',
            href: '/company/audit',
            icon: <FileProtectOutlined />,
            title: 'Журнал действий',
            desc: 'Кто, что и когда менял в вашей компании',
            bg: '#f0fdf4', fg: '#15803d',
        });
    }

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* ===== HERO ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Личный кабинет</div>
                    <h1 className="lc2-title">Кабинет</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        {user?.company?.name || 'Ваша компания'} · {user?.firstName} {user?.lastName}
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#eef2ff', color: '#4f46e5' }}><UserOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Ваша роль</div>
                            <div className="lc2-mvalue" style={{ fontSize: 18 }}>
                                {isAdmin ? 'Администратор' : user?.role === 'LOGISTICIAN' ? 'Логист' : user?.role === 'ACCOUNTANT' ? 'Бухгалтер' : 'Сотрудник'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== КАРТОЧКИ РАЗДЕЛОВ ===== */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
                marginTop: 20,
            }}>
                {cards.map(c => (
                    <div
                        key={c.key}
                        className="lc-card"
                        onClick={() => router.push(c.href)}
                        style={{
                            padding: '22px 22px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14,
                            transition: 'transform .15s ease, box-shadow .15s ease',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                    >
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: c.bg, color: c.fg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22,
                        }}>
                            {c.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--lc-text)', letterSpacing: '-0.01em' }}>{c.title}</div>
                            <div style={{ fontSize: 12.5, color: 'var(--lc-text-ter)', marginTop: 4, lineHeight: 1.5 }}>{c.desc}</div>
                        </div>
                        <div style={{ marginTop: 'auto' }}>
                            <Text style={{ color: c.fg, fontWeight: 600, fontSize: 13 }}>
                                Открыть <ArrowRightOutlined style={{ fontSize: 11 }} />
                            </Text>
                        </div>
                    </div>
                ))}
            </div>

            {!isAdmin && (
                <div style={{ marginTop: 20, color: 'var(--lc-text-ter)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ApartmentOutlined /> Управление сотрудниками и данными компании доступно администратору.
                </div>
            )}
        </div>
    );
}
