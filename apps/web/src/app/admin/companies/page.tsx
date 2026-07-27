'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Empty, Input, Modal, Segmented, Space, Spin, Table, Tag, theme } from 'antd';
import { CheckOutlined, CloseOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const DOCUMENT_LABELS: Record<string, string> = {
    COMPANY_REGISTRATION: 'Справка о госрегистрации',
    DIRECTOR_APPOINTMENT: 'Приказ о назначении руководителя',
    DIRECTOR_ID: 'Удостоверение личности руководителя',
};

const STATUS_VIEW: Record<string, { label: string; color: string }> = {
    DRAFT: { label: 'Черновик', color: 'default' },
    PENDING: { label: 'На проверке', color: 'processing' },
    VERIFIED: { label: 'Подтверждена', color: 'success' },
    REJECTED: { label: 'Отклонена', color: 'error' },
};

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
}

/**
 * Очередь подтверждения организаций — рабочее место владельца платформы.
 *
 * БИН в Казахстане публичен, поэтому регистрация сама по себе ничего не
 * доказывает: допуск компании к работе даёт человек, сверив документы.
 */
export default function AdminCompaniesPage() {
    const { token } = theme.useToken();
    const [status, setStatus] = useState('PENDING');
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

    const reject = (company: ReviewCompany) => {
        let reason = '';
        Modal.confirm({
            title: `Отклонить «${company.name}»?`,
            content: (
                <div>
                    <p style={{ fontSize: 13, color: token.colorTextSecondary }}>
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
        <div className="lc-page" style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Платформа</div>
                    <h1 className="lc2-title">Подтверждение организаций</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        БИН в Казахстане — публичные данные, поэтому его ввод ничего не доказывает.
                        Сверьте справку о регистрации, приказ о руководителе и удостоверение личности.
                    </p>
                </div>
            </div>

            <Segmented
                value={status}
                onChange={(value) => setStatus(String(value))}
                style={{ marginBottom: 14 }}
                options={[
                    { value: 'PENDING', label: 'На проверке' },
                    { value: 'VERIFIED', label: 'Подтверждённые' },
                    { value: 'REJECTED', label: 'Отклонённые' },
                    { value: 'DRAFT', label: 'Черновики' },
                ]}
            />

            <div className="lc-card" style={{ padding: 0 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                ) : rows.length === 0 ? (
                    <Empty
                        style={{ padding: 48 }}
                        description={status === 'PENDING' ? 'Заявок на проверке нет' : 'Пусто'}
                    />
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
                                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
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
                                    <span style={{
                                        color: record.documents.length === 3 ? token.colorSuccess : token.colorWarning,
                                        fontWeight: 600,
                                    }}>
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
                                        <Tag color={STATUS_VIEW[value]?.color}>{STATUS_VIEW[value]?.label}</Tag>
                                        {record.rejectionReason && (
                                            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
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
            </div>
        </div>
    );
}
