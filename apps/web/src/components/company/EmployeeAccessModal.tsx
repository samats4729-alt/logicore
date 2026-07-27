'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Checkbox, Modal, Select, Skeleton, Tag } from 'antd';
import { BankOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { toast } from 'sonner';

/** Роли, которые можно выдать сотруднику в организации холдинга. */
const ROLE_OPTIONS = [
    { label: 'Менеджер', value: 'LOGISTICIAN' },
    { label: 'Бухгалтер', value: 'ACCOUNTANT' },
    { label: 'Завсклад', value: 'WAREHOUSE_MANAGER' },
    { label: 'Экспедитор', value: 'FORWARDER' },
    { label: 'Администратор', value: 'COMPANY_ADMIN' },
];

interface AccessCompany {
    id: string;
    name: string | null;
    bin: string | null;
    hasAccess: boolean;
    role: string | null;
}

interface EmployeeAccessModalProps {
    /** id сотрудника; null — окно закрыто. */
    userId: string | null;
    userName: string;
    /** Роль сотрудника — подставляется по умолчанию для новых организаций. */
    defaultRole?: string;
    onClose: () => void;
    /** Доступ изменён — обновить список сотрудников снаружи. */
    onSaved?: () => void;
}

/**
 * Доступ сотрудника к организациям холдинга.
 *
 * Раньше выбрать организации можно было только в момент приглашения: нанял
 * человека — и всё, добавить ему второе юрлицо было нечем. При этом новая
 * организация молча забирала к себе всю команду, так что доступ «во все»
 * получали только те, кого наняли раньше неё.
 *
 * Роль указывается для каждой организации отдельно: один человек может быть
 * бухгалтером в одном юрлице и менеджером в другом.
 */
export default function EmployeeAccessModal({
    userId,
    userName,
    defaultRole = 'LOGISTICIAN',
    onClose,
    onSaved,
}: EmployeeAccessModalProps) {
    const [companies, setCompanies] = useState<AccessCompany[]>([]);
    const [canShare, setCanShare] = useState(true);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const res = await api.get(`/company/employees/${userId}/access`);
            setCompanies(res.data?.companies || []);
            setCanShare(res.data?.user?.canShare !== false);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось загрузить доступы');
            onClose();
        } finally {
            setLoading(false);
        }
    }, [userId, onClose]);

    useEffect(() => { load(); }, [load]);

    const toggle = (companyId: string, checked: boolean) => {
        setCompanies((prev) => prev.map((company) => (company.id === companyId
            ? { ...company, hasAccess: checked, role: checked ? (company.role || defaultRole) : null }
            : company)));
    };

    const setRole = (companyId: string, role: string) => {
        setCompanies((prev) => prev.map((company) => (company.id === companyId
            ? { ...company, role }
            : company)));
    };

    const save = async () => {
        const items = companies
            .filter((company) => company.hasAccess)
            .map((company) => ({ companyId: company.id, role: company.role || defaultRole }));

        setSaving(true);
        try {
            await api.put(`/company/employees/${userId}/access`, { items });
            toast.success('Доступ к организациям сохранён');
            onSaved?.();
            onClose();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось сохранить доступ');
        } finally {
            setSaving(false);
        }
    };

    const selected = companies.filter((company) => company.hasAccess).length;

    return (
        <Modal
            open={Boolean(userId)}
            onCancel={onClose}
            onOk={save}
            okText="Сохранить"
            cancelText="Отмена"
            confirmLoading={saving}
            okButtonProps={{ disabled: loading || !canShare }}
            title={<span><BankOutlined style={{ marginRight: 8 }} />Доступ к организациям — {userName}</span>}
            width={620}
        >
            {loading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
            ) : !canShare ? (
                <Alert
                    type="info"
                    showIcon
                    message="Водителю доступ к организациям не выдаётся"
                    description="Водитель привязан к своему перевозчику, а не к юрлицам холдинга."
                />
            ) : (
                <>
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 14 }}
                        message="Отметьте организации, в которых сотрудник работает. Роль задаётся отдельно для каждой: можно быть бухгалтером в одной и менеджером в другой."
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {companies.map((company) => (
                            <div
                                key={company.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 12px',
                                    border: '1px solid var(--lc-border)',
                                    borderRadius: 10,
                                }}
                            >
                                <Checkbox
                                    checked={company.hasAccess}
                                    onChange={(e) => toggle(company.id, e.target.checked)}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                                        {company.name || 'Без названия'}
                                    </div>
                                    {company.bin && (
                                        <div style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>
                                            БИН {company.bin}
                                        </div>
                                    )}
                                </div>
                                <Select
                                    size="small"
                                    style={{ width: 160 }}
                                    value={company.role || defaultRole}
                                    disabled={!company.hasAccess}
                                    onChange={(value) => setRole(company.id, value)}
                                    options={ROLE_OPTIONS}
                                />
                            </div>
                        ))}
                    </div>
                    {selected === 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginTop: 14 }}
                            message="Не отмечено ни одной организации — сотрудник потеряет доступ ко всем."
                        />
                    )}
                    <div style={{ marginTop: 12, fontSize: 12, color: 'var(--lc-text-ter)' }}>
                        Отмечено: <Tag>{selected}</Tag> из {companies.length}
                    </div>
                </>
            )}
        </Modal>
    );
}
