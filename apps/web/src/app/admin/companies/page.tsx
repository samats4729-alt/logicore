'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Descriptions, Input, Modal, Space, Switch, Table } from 'antd';
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

/**
 * Взять название в кавычки, если их там ещё нет.
 *
 * Названия в базе хранятся как в учредительных документах — вместе с
 * кавычками: «ТОО «Ромашка»». Внешние кавычки поверх них давали
 * «ТОО «Ромашка»» в двойной обёртке.
 */
const quoted = (name: string) => (name.includes('«') ? name : `«${name}»`);

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
    /** Отказ окончательный: подача и работа закрыты. */
    verificationBlockedAt: string | null;
    createdAt: string;
    documents: { id: string; type: string; fileName: string; fileUrl: string }[];
    /** Организация с этим же БИН уже подтверждена — эту подтвердить нельзя. */
    binVerifiedBy: { id: string; name: string } | null;
    /** Другие заявки на тот же БИН: одна из них — не та компания. */
    binOtherApplications: {
        id: string;
        name: string;
        verificationStatus: string;
        blocked: boolean;
        submittedAt: string;
    }[];
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
            title: `Подтвердить ${quoted(company.name)}?`,
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
            title: `Отдать ${quoted(company.name)} её рейсы в работе?`,
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

    /**
     * Отклонить заявку.
     *
     * Два разных отказа под одной кнопкой. Обычный — замечание: человек
     * исправляет документ и подаёт заново. Окончательный — для случая, когда
     * фирму зарегистрировал не её владелец: исправлять нечего, и без запрета
     * он вернётся с тем же БИН завтра, а до тех пор продолжит выставлять
     * счета от чужого имени.
     */
    const reject = (company: ReviewCompany) => {
        let reason = '';
        let block = false;
        Modal.confirm({
            title: `Отклонить ${quoted(company.name)}?`,
            width: 520,
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
                    <label style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                        <Checkbox onChange={(e) => { block = e.target.checked; }} />
                        <span style={{ fontSize: 12.5 }}>
                            Запретить повторную подачу и закрыть кабинет
                            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--nova-fg-3)' }}>
                                Для чужих регистраций: организация больше не сможет ни отправить
                                документы, ни создавать заявки и бухгалтерию. Настоящему владельцу
                                этот БИН остаётся свободен. Запрет снимается здесь же.
                            </span>
                        </span>
                    </label>
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
                        block,
                    });
                    toast.success(block
                        ? 'Заявка отклонена, доступ закрыт'
                        : 'Организация отклонена');
                    await load();
                } finally {
                    setActing(null);
                }
            },
        });
    };

    /** Снять окончательный отказ: ошибиться здесь легко, обратный ход нужен. */
    const unblock = (company: ReviewCompany) => {
        Modal.confirm({
            title: `Снять запрет с ${quoted(company.name)}?`,
            content: 'Организация снова сможет приложить документы, подать заявку и вести учёт.',
            okText: 'Снять запрет',
            cancelText: 'Отмена',
            onOk: async () => {
                setActing(company.id);
                try {
                    await api.post(`/admin/company-verification/${company.id}/unblock`);
                    toast.success('Запрет снят');
                    await load();
                } catch (e: any) {
                    toast.error(e.response?.data?.message || 'Не удалось снять запрет');
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
                                                message={`БИН ${record.bin} уже подтверждён у ${quoted(record.binVerifiedBy.name)}`}
                                                description="Одна организация — один БИН. Если это та же фирма, работа идёт в её кабинете; эту заявку отклоните с причиной."
                                            />
                                        )}
                                        {record.binOtherApplications.length > 0 && (
                                            <Alert
                                                type="warning"
                                                showIcon
                                                message={`На этот БИН есть ещё ${record.binOtherApplications.length === 1
                                                    ? 'одна заявка'
                                                    : `заявок: ${record.binOtherApplications.length}`}`}
                                                description={
                                                    <div>
                                                        <div style={{ marginBottom: 6 }}>
                                                            Одну и ту же фирму заявляют дважды: настоящий владелец
                                                            здесь только один. Сверьте удостоверение личности с
                                                            приказом о назначении, прежде чем подтверждать.
                                                        </div>
                                                        {record.binOtherApplications.map((other) => (
                                                            <div key={other.id} style={{ fontSize: 12 }}>
                                                                {quoted(other.name)} — {STATUS_VIEW[other.verificationStatus]?.label
                                                                    || other.verificationStatus}
                                                                {other.blocked && ', доступ закрыт'}
                                                                {' · '}
                                                                {dayjs(other.submittedAt).format('DD.MM.YYYY')}
                                                            </div>
                                                        ))}
                                                    </div>
                                                }
                                            />
                                        )}
                                        {record.verificationBlockedAt && (
                                            <Alert
                                                type="error"
                                                showIcon
                                                message="Отказ окончательный — доступ закрыт"
                                                description={
                                                    <div>
                                                        <div>
                                                            Заявку признали чужой {dayjs(record.verificationBlockedAt)
                                                                .format('DD.MM.YYYY')}: подать документы заново и вести
                                                            учёт эта организация не может.
                                                        </div>
                                                        <Button
                                                            size="small"
                                                            style={{ marginTop: 8 }}
                                                            loading={acting === record.id}
                                                            onClick={() => unblock(record)}
                                                        >
                                                            Снять запрет
                                                        </Button>
                                                    </div>
                                                }
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
                                width: 190,
                                render: (value: string, record: ReviewCompany) => (
                                    <div>
                                        <span className={`${nova.chip} ${
                                            STATUS_VIEW[value]?.chip === 'neg' ? nova.chipNeg
                                                : STATUS_VIEW[value]?.chip === 'warn' ? nova.chipWarn : ''
                                        }`}>
                                            {STATUS_VIEW[value]?.label || value}
                                        </span>
                                        {record.verificationBlockedAt && (
                                            <div style={{ fontSize: 11, color: 'var(--nova-neg)', marginTop: 4, fontWeight: 600 }}>
                                                Доступ закрыт
                                            </div>
                                        )}
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
                                        {/* Уже отклонённую можно отклонить ещё раз — чтобы
                                            дописать запрет, если стало ясно, что фирма чужая. */}
                                        <Button
                                            danger
                                            size="small"
                                            icon={<CloseOutlined />}
                                            loading={acting === record.id}
                                            disabled={Boolean(record.verificationBlockedAt)}
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
