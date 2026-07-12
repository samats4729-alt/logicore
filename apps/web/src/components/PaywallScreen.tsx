'use client';

import { useEffect, useState } from 'react';
import { Button, Spin, Tag } from 'antd';
import { CheckOutlined, ReloadOutlined, LogoutOutlined, LockOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface Plan {
    id: string;
    name: string;
    description?: string | null;
    priceMonthly: number;
    currency: string;
    maxUsers?: number | null;
    maxOrdersPerMonth?: number | null;
    features: string[];
}

/**
 * Экран «Подписка не активна». Показывается вместо кабинета, когда биллинг
 * включён и у компании закончился пробный период или оплаченный срок.
 * Данные компании не удаляются — после активации подписки всё открывается.
 */
export default function PaywallScreen({ status }: { status?: { status?: string | null; trialEndsAt?: string | null } }) {
    const { logout } = useAuthStore();
    const [plans, setPlans] = useState<Plan[] | null>(null);

    useEffect(() => {
        api.get('/billing/plans')
            .then((res) => setPlans(res.data || []))
            .catch(() => setPlans([]));
    }, []);

    const wasTrial = status?.status === 'PAST_DUE' || status?.status === 'TRIAL';

    return (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px 48px' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{
                    width: 56, height: 56, borderRadius: 18, margin: '0 auto 16px',
                    background: 'var(--lc-card)', border: '1px solid var(--lc-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, color: '#1677ff', boxShadow: '0 1px 2px rgba(16,24,40,.04)',
                }}>
                    <LockOutlined />
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--lc-text)', margin: 0 }}>
                    Подписка не активна
                </h1>
                <p style={{ color: 'var(--lc-text-ter)', fontSize: 14, marginTop: 8, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
                    {wasTrial
                        ? 'Пробный период завершён. Выберите тариф, чтобы продолжить работу — все данные компании сохранены.'
                        : 'Срок подписки истёк. Продлите тариф, чтобы продолжить работу — все данные компании сохранены.'}
                </p>
            </div>

            {plans === null ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>
            ) : plans.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                    gap: 14,
                    marginBottom: 26,
                }}>
                    {plans.map((p) => (
                        <div key={p.id} className="lc-card" style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--lc-text)' }}>{p.name}</div>
                            {p.description && (
                                <div style={{ fontSize: 12, color: 'var(--lc-text-ter)', marginTop: 2 }}>{p.description}</div>
                            )}
                            <div style={{ margin: '12px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
                                <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--lc-text)' }}>
                                    {p.priceMonthly.toLocaleString('ru-RU')} ₸
                                </span>
                                <span style={{ fontSize: 12.5, color: 'var(--lc-text-ter)' }}> / мес</span>
                            </div>
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {p.maxUsers != null && (
                                    <span style={{ fontSize: 12.5, color: 'var(--lc-text-sec)' }}>
                                        <CheckOutlined style={{ color: '#16a34a', marginRight: 6 }} />До {p.maxUsers} сотрудников
                                    </span>
                                )}
                                {p.maxOrdersPerMonth != null && (
                                    <span style={{ fontSize: 12.5, color: 'var(--lc-text-sec)' }}>
                                        <CheckOutlined style={{ color: '#16a34a', marginRight: 6 }} />До {p.maxOrdersPerMonth} заявок в месяц
                                    </span>
                                )}
                                {p.features.map((f) => (
                                    <span key={f} style={{ fontSize: 12.5, color: 'var(--lc-text-sec)' }}>
                                        <CheckOutlined style={{ color: '#16a34a', marginRight: 6 }} />{f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="lc-card" style={{ padding: '18px 22px', textAlign: 'center' }}>
                <Tag color="blue" style={{ marginBottom: 8 }}>Оплата по счёту</Tag>
                <div style={{ fontSize: 13.5, color: 'var(--lc-text-sec)', maxWidth: 520, margin: '0 auto' }}>
                    Свяжитесь с нами — мы выставим счёт на вашу компанию. После оплаты
                    доступ откроется автоматически, ничего перенастраивать не нужно.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                    <Button type="primary" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
                        Я оплатил — обновить
                    </Button>
                    <Button icon={<LogoutOutlined />} onClick={logout}>
                        Выйти
                    </Button>
                </div>
            </div>
        </div>
    );
}
