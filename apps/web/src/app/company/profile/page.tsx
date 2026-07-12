'use client';

import { useState } from 'react';
import { Button, Upload, message, Divider, Tag } from 'antd';
import { CameraOutlined, UserOutlined, MailOutlined, PhoneOutlined, BankOutlined, IdcardOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import UserAvatar, { notifyAvatarUpdated } from '@/components/UserAvatar';
import { shortenCompanyName } from '@/lib/company-helper';

const ROLE_LABELS: Record<string, string> = {
    COMPANY_ADMIN: 'Администратор',
    LOGISTICIAN: 'Менеджер',
    WAREHOUSE_MANAGER: 'Заведующий складом',
    ACCOUNTANT: 'Бухгалтер',
    FORWARDER: 'Экспедитор',
    DRIVER: 'Водитель',
    ADMIN: 'Администратор платформы',
};

const ROLE_COLORS: Record<string, string> = {
    COMPANY_ADMIN: 'blue',
    LOGISTICIAN: 'geekblue',
    WAREHOUSE_MANAGER: 'orange',
    ACCOUNTANT: 'green',
    FORWARDER: 'purple',
    DRIVER: 'cyan',
    ADMIN: 'red',
};

export default function ProfilePage() {
    const { user, checkAuth } = useAuthStore();
    const [uploading, setUploading] = useState(false);
    const [hasAvatar, setHasAvatar] = useState<boolean | null>(null);

    if (!user) return null;

    const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || '?';
    const avatarExists = hasAvatar ?? !!(user as any).avatarPath;

    const handleUpload = async (file: File) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('avatar', file);
            await api.post('/users/me/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setHasAvatar(true);
            notifyAvatarUpdated(user.id);
            await checkAuth();
            message.success('Фото профиля обновлено');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Не удалось загрузить фото');
        } finally {
            setUploading(false);
        }
        return false;
    };

    const infoRows: Array<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = [
        { icon: <MailOutlined />, label: 'Email', value: user.email || '—' },
        { icon: <PhoneOutlined />, label: 'Телефон', value: (user as any).phone || '—' },
        {
            icon: <IdcardOutlined />,
            label: 'Роль',
            value: <Tag color={ROLE_COLORS[user.role] || 'default'} style={{ marginRight: 0 }}>{ROLE_LABELS[user.role] || user.role}</Tag>,
        },
        { icon: <BankOutlined />, label: 'Компания', value: user.company?.name ? shortenCompanyName(user.company.name) : '—' },
    ];
    if ((user as any).position) {
        infoRows.splice(3, 0, { icon: <UserOutlined />, label: 'Должность', value: (user as any).position });
    }

    return (
        <div className="lc-page" style={{ maxWidth: 720, margin: '0 auto' }}>
            {/* ===== HERO ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Аккаунт</div>
                    <h1 className="lc2-title">Мой профиль</h1>
                </div>
            </div>

            <div className="lc-card" style={{ padding: '28px 28px 20px' }}>
                {/* Шапка профиля: фото + имя */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <UserAvatar
                            userId={user.id}
                            hasAvatar={avatarExists}
                            size={96}
                            style={{ boxShadow: '0 4px 16px rgba(16, 24, 40, 0.12)' }}
                            fallback={
                                <span style={{
                                    width: 96, height: 96, borderRadius: '50%',
                                    background: 'linear-gradient(145deg, #007aff, #5856d6)',
                                    color: '#fff', fontWeight: 700, fontSize: 32,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 16px rgba(16, 24, 40, 0.12)',
                                }}>
                                    {initials}
                                </span>
                            }
                        />
                        <Upload
                            accept="image/png,image/jpeg,image/webp"
                            showUploadList={false}
                            beforeUpload={(file) => { handleUpload(file as unknown as File); return false; }}
                        >
                            <Button
                                shape="circle"
                                size="small"
                                icon={<CameraOutlined />}
                                loading={uploading}
                                title="Загрузить фото"
                                style={{
                                    position: 'absolute', right: -2, bottom: -2,
                                    boxShadow: '0 2px 8px rgba(16, 24, 40, 0.18)',
                                }}
                            />
                        </Upload>
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--lc-text)' }}>
                            {user.lastName} {user.firstName}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--lc-text-ter)', marginTop: 4 }}>
                            Фото видно коллегам в схеме компании. Каждый сотрудник меняет только своё фото.
                        </div>
                    </div>
                </div>

                <Divider style={{ margin: '22px 0 8px' }} />

                {/* Данные аккаунта */}
                {infoRows.map((row) => (
                    <div
                        key={row.label}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 0', borderBottom: '1px solid var(--lc-border-soft, var(--lc-border))',
                            fontSize: 13.5,
                        }}
                    >
                        <span style={{ color: 'var(--lc-text-ter)', width: 18, textAlign: 'center' }}>{row.icon}</span>
                        <span style={{ color: 'var(--lc-text-ter)', width: 110, flexShrink: 0 }}>{row.label}</span>
                        <span style={{ color: 'var(--lc-text)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.value}
                        </span>
                    </div>
                ))}

                <div style={{ fontSize: 12, color: 'var(--lc-text-ter)', padding: '14px 0 4px' }}>
                    Данные профиля изменяет администратор компании в разделе «Компания → Сотрудники».
                </div>
            </div>
        </div>
    );
}
