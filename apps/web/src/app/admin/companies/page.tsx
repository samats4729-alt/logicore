'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Input, Modal, Space, Switch, Table } from 'antd';
import { CheckOutlined, CloseOutlined, FileTextOutlined } from '@ant-design/icons';
import { ShieldCheck } from 'lucide-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';
import nova from '@/components/nova/nova.module.css';

const DOCUMENT_LABELS: Record<string, string> = {
    COMPANY_REGISTRATION: 'Справка о госрегистрации',
    DIRECTOR_APPOINTMENT: 'Приказ о назначении руководителя',
    DIRECTOR_ID: 'Удостоверение личности руководителя',
};

/** Состояние заявки. Цветом — только то, что требует действия или пошло не так. */
const STATUS_VIEW: Record<string, { label: string; chip?: 'warn' | 'neg' }> = {
    DRAFT: { label: 'Черновик' },
    PENDING: { label: 'На проверке', chip: 'warn' },
    VERIFIED: { label: 'Подтверждена' },
    REJECTED: { label: 'Отклонена', chip: 'neg' },
};

const STATUS_TABS = [
    { value: 'PENDING', label: 'На проверке' },
    { value: 'VERIFIED', label: 'Подтверждённые' },
    { value: 'REJECTED', label: 'Отклонённые' },
    { value: 'DRAFT', label: 'Черновики' },
];

interface ReviewCompany {
    id: string;
    name: string;
    bin: string;
    email: string | null;
    phone: string | null;
    directorName: string | null;
    verificationStatus: string;
    verificationSubmittedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
    documents: { id: string; type: string; fileName: string; fileUrl: string }[];
    /** Организация с этим же БИН уже подтверждена — эту подтвердить нельзя. */
    binVerifiedBy: { id: string; name: string } | null;
    /** У кого этот БИН уже заведён как контрагент. */
    binKnownAsPartner: { id: string; name: string; ownerCompanyName: string | null }[];
}

/**
 * Очередь подтверждения организаций — рабочее место владельца платформы.
 *
 * БИН в Казахстане публичен, поэтому регистрация сама по себе ничего не
 * доказывает: допуск компании к работе даёт человек, сверив документы.
 */
export default function AdminCompaniesPage() {
    const [status, setStatus] = useState('PENDING');
    const [requireVerification, setRequireVerification] = useState(false);
    const [savingRequirement, setSavingRequirement] = useState(false);

    useEffect(() => {
        api.get('/admin/company-verification/settings')
            .then((res) => setRequireVerification(Boolean(res.data?.required)))
            .catch(() => setRequireVerification(false));
    }, []);

    /**
     * Включить или выключить обязательность подтверждения.
     *
     * Действие тихое, но с последствиями для всех сразу: включённое
     * подтверждение закрывает заявки и документы каждой непроверенной
     * компании. Поэтому говорим словами, что именно произошло.
     */
    const setRequirement = async (value: boolean) => {
        setSavingRequirement(true);
        try {
            await api.put('/admin/company-verification/settings', { required: value });
            setRequireVerification(value);
            toast.success(value
                ? 'Теперь без подтверждения заявки и документы недоступны'
                : 'Работать можно и без подтверждения');
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось сохранить');
        } finally {
            setSavingRequirement(false);
        }
    };
    const [rows, setRows] = useState<ReviewCompany[]>([]);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/admin/company-verification', { params: { status } });
            setRows(res.data || []);
        } catch {
            toast.error('Не удалось загрузить очередь проверки');
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => { load(); }, [load]);

    const approve = async (company: ReviewCompany) => {
        Modal.confirm({
            title: `Подтвердить «${company.name}»?`,
            content: 'Организация получит доступ к заявкам и бухгалтерии.',
            okText: 'Подтвердить',
            cancelText: 'Отмена',
            onOk: async () => {
                setActing(company.id);
                try {
                    await api.post(`/admin/company-verification/${company.id}/approve`);
                    toast.success('Организация подтверждена');
                    await load();
                } finally {
                    setActing(null);
                }
            },
        });
    };

    /**
     * Отдать организации её рейсы, которые сейчас в работе.
     *
     * Отдельным действием, а не вместе с подтверждением: решение принимается
     * по документам, и владелец должен видеть, у кого именно этот БИН уже
     * заведён, прежде чем передавать рейсы.
     */
    const linkActiveOrders = (company: ReviewCompany) => {
        const owners = company.binKnownAsPartner
            .map((partner) => partner.ownerCompanyName || partner.name)
            .join(', ');
        Modal.confirm({
            title: `Отдать «${company.name}» её рейсы в работе?`,
            content: (
                <div style={{ fontSize: 13 }}>
                    <p>
                        Этот БИН заведён как контрагент у: {owners || '—'}. Незавершённые рейсы
                        с этой карточкой станут видны организации в её кабинете.
                    </p>
                    <p style={{ color: 'var(--nova-fg-3)' }}>
                        Завершённые и отменённые рейсы остаются как были. Счета и платежи не
                        трогаются — они остаются у того, кто завёл карточку.
                    </p>
                </div>
            ),
            okText: 'Отдать рейсы',
            cancelText: 'Отмена',
            onOk: async () => {
                setActing(company.id);
                try {
                    const res = await api.post(`/admin/company-verification/${company.id}/link-active-orders`);
                    const moved = res.data?.movedOrders ?? 0;
                    toast.success(moved > 0
                        ? `Передано рейсов: ${moved}`
                        : 'Незавершённых рейсов по этому БИН не нашлось');
                    await load();
                } catch (e: any) {
                    toast.error(e.response?.data?.message || 'Не удалось передать рейсы');
                } finally {
                    setActing(null);
                }
            },
        });
    };

    const reject = (company: ReviewCompany) => {
        let reason = '';
        Modal.confirm({
            title: `Отклонить «${company.name}»?`,
            content: (
                <div>
                    <p style={{ fontSize: 13, color: 'var(--nova-fg-3)' }}>
                        Причина видна заявителю — по ней он поймёт, что исправить и приложить заново.
                    </p>
                    <Input.TextArea
                        rows={3}
                        placeholder="Например: приказ о назначении без подписи"
                        onChange={(e) => { reason = e.target.value; }}
                    />
                </div>
            ),
            okText: 'Отклонить',
            okButtonProps: { danger: true },
            cancelText: 'Отмена',
            onOk: async () => {
                if (!reason.trim()) {
                    toast.warning('Укажите причину отказа');
                    return Promise.reject();
                }
                setActing(company.id);
                try {
                    await api.post(`/admin/company-verification/${company.id}/reject`, {
                        reason: reason.trim(),
                    });
                    toast.success('Организация отклонена');
                    await load();
                } finally {
                    setActing(null);
                }
            },
        });
    };

    // Документ отдаёт защищённая ручка: в пакете есть скан удостоверения
    // личности, статикой по пути файла его раздавать нельзя.
    const openDocument = (documentId: string) => {
        const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        window.open(`${base}/admin/company-verification/documents/${documentId}`, '_blank', 'noopener');
    };

    return (
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Подтверждение организаций</h1>
                    <p className={nova.subtitle}>
                        БИН в Казахстане — публичные данные, поэтому его ввод ничего не доказывает.
                        Сверьте справку о регистрации, приказ о руководителе и удостоверение личности.
                    </p>
                </div>
                {/* Рубильник обязательности. Сейчас выключен: компания ведёт
                    учёт с первого дня, а проверка догоняет её. Когда решите
                    иначе — включается здесь, без правки кода. */}
                <div className={nova.heroActions}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--nova-fg-2)' }}>
                        <Switch
                            size="small"
                            checked={requireVerification}
                            loading={savingRequirement}
                            onChange={setRequirement}
                        />
                        <span>
                            Без подтверждения работать нельзя
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--nova-fg-3)' }}>
                                {requireVerification
                                    ? 'Заявки и документы закрыты до проверки'
                                    : 'Сейчас работают все, проверка — отметка о доверии'}
                            </span>
                        </span>
                    </label>
                </div>
            </div>

            <div className={nova.pills} style={{ marginBottom: 14 }} role="tablist">
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab.value}
                        type="button"
                        role="tab"
                        aria-selected={status === tab.value}
                        className={`${nova.pill} ${status === tab.value ? nova.pillActive : ''}`}
                        onClick={() => setStatus(tab.value)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <ShieldCheck size={14} />
                    <h2 className={nova.cardTitle}>
                        {STATUS_TABS.find((tab) => tab.value === status)?.label}
                    </h2>
                    {rows.length > 0 && <span className={nova.cardCount}>{rows.length}</span>}
                </div>
                {loading ? (
                    <div className={nova.empty}><Loader size="large" /></div>
                ) : rows.length === 0 ? (
                    <div className={nova.empty}>
                        {status === 'PENDING'
                            ? 'Заявок на проверке нет — все организации разобраны'
                            : 'Пусто'}
                    </div>
                ) : (
                    <Table
                        dataSource={rows}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        expandable={{
                            expandedRowRender: (record) => (
                                <div style={{ padding: '8px 4px' }}>
                                    <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
                                        <Descriptions.Item label="Руководитель">
                                            {record.directorName || '—'}
                                        </Descriptions.Item>
                                        <Descriptions.Item label="Контакты">
                                            {[record.email, record.phone].filter(Boolean).join(' · ') || '—'}
                                        </Descriptions.Item>
                                    </Descriptions>
                                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                        {/*
                                          * Что ещё известно про этот БИН. Раньше совпадение
                                          * всплывало только отказом в момент нажатия
                                          * «Подтвердить» — решение принималось вслепую.
                                          */}
                                        {record.binVerifiedBy && (
                                            <Alert
                                                type="error"
                                                showIcon
                                                message={`БИН ${record.bin} уже подтверждён у «${record.binVerifiedBy.name}»`}
                                                description="Одна организация — один БИН. Если это та же фирма, работа идёт в её кабинете; эту заявку отклоните с причиной."
                                            />
                                        )}
                                        {record.binKnownAsPartner.length > 0 && (
                                            <Alert
                                                type="info"
                                                showIcon
                                                message={`Этот БИН уже заведён как контрагент у ${record.binKnownAsPartner.length} ${record.binKnownAsPartner.length === 1 ? 'компании' : 'компаний'}`}
                                                description={
                                                    <div>
                                                        <div>{record.binKnownAsPartner
                                                            .map((partner) => partner.ownerCompanyName || partner.name)
                                                            .join(', ')}</div>
                                                        {record.verificationStatus === 'VERIFIED' && (
                                                            <Button
                                                                size="small"
                                                                style={{ marginTop: 8 }}
                                                                loading={acting === record.id}
                                                                onClick={() => linkActiveOrders(record)}
                                                            >
                                                                Отдать рейсы в работе
                                                            </Button>
                                                        )}
                                                    </div>
                                                }
                                            />
                                        )}
                                        {record.documents.length === 0 && (
                                            <Alert type="warning" showIcon message="Документы не приложены" />
                                        )}
                                        {record.documents.map((document) => (
                                            <Button
                                                key={document.id}
                                                size="small"
                                                icon={<FileTextOutlined />}
                                                onClick={() => openDocument(document.id)}
                                                style={{ textAlign: 'left' }}
                                            >
                                                {DOCUMENT_LABELS[document.type] || document.type}: {document.fileName}
                                            </Button>
                                        ))}
                                    </Space>
                                </div>
                            ),
                        }}
                        columns={[
                            {
                                title: 'Организация',
                                key: 'name',
                                render: (_: unknown, record: ReviewCompany) => (
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{record.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>
                                            БИН {record.bin}
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                title: 'Подана',
                                dataIndex: 'verificationSubmittedAt',
                                width: 130,
                                render: (value: string | null, record: ReviewCompany) =>
                                    dayjs(value || record.createdAt).format('DD.MM.YYYY HH:mm'),
                            },
                            {
                                title: 'Документов',
                                key: 'documents',
                                width: 110,
                                align: 'center' as const,
                                render: (_: unknown, record: ReviewCompany) => (
                                    <span
                                        className={record.documents.length === 3 ? undefined : nova.valueWarn}
                                        style={{ fontWeight: 600 }}
                                    >
                                        {record.documents.length} / 3
                                    </span>
                                ),
                            },
                            {
                                title: 'Статус',
                                dataIndex: 'verificationStatus',
                                width: 130,
                                render: (value: string, record: ReviewCompany) => (
                                    <div>
                                        <span className={`${nova.chip} ${
                                            STATUS_VIEW[value]?.chip === 'neg' ? nova.chipNeg
                                                : STATUS_VIEW[value]?.chip === 'warn' ? nova.chipWarn : ''
                                        }`}>
                                            {STATUS_VIEW[value]?.label || value}
                                        </span>
                                        {record.rejectionReason && (
                                            <div style={{ fontSize: 11, color: 'var(--nova-fg-3)', marginTop: 4 }}>
                                                {record.rejectionReason}
                                            </div>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                title: '',
                                key: 'actions',
                                width: 210,
                                render: (_: unknown, record: ReviewCompany) => (
                                    <Space size={6}>
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<CheckOutlined />}
                                            loading={acting === record.id}
                                            disabled={record.verificationStatus === 'VERIFIED'}
                                            onClick={() => approve(record)}
                                        >
                                            Подтвердить
                                        </Button>
                                        <Button
                                            danger
                                            size="small"
                                            icon={<CloseOutlined />}
                                            loading={acting === record.id}
                                            disabled={record.verificationStatus === 'REJECTED'}
                                            onClick={() => reject(record)}
                                        >
                                            Отклонить
                                        </Button>
                                    </Space>
                                ),
                            },
                        ]}
                    />
                )}
            </section>
        </div>
    );
}
