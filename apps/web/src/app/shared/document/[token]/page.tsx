'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, Descriptions, Table, Typography, theme } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import Loader from '@/components/ui/Loader';

const { Title, Text } = Typography;

const TYPE_LABELS: Record<string, string> = {
    PAYMENT_INVOICE: 'Счёт на оплату',
    SERVICE_ACT: 'Акт выполненных работ',
    RECONCILIATION_ACT: 'Акт сверки взаимных расчётов',
};

const money = (value: number) =>
    `${(value ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;

const party = (snapshot: Record<string, any> | undefined) => {
    if (!snapshot) return '—';
    return [snapshot.name, snapshot.bin ? `БИН ${snapshot.bin}` : null, snapshot.address]
        .filter(Boolean)
        .join(', ');
};

/**
 * Публичная страница документа для контрагента без учётной записи.
 *
 * Отдаётся только проведённый документ и только по действующей ссылке:
 * отозванная и несуществующая ссылка выглядят одинаково, чтобы по ответу
 * нельзя было перебирать токены.
 */
export default function SharedDocumentPage() {
    const params = useParams();
    const token = params?.token as string;
    const { token: theme_ } = theme.useToken();

    const [document, setDocument] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [unavailable, setUnavailable] = useState(false);

    useEffect(() => {
        if (!token) return;
        api.get(`/public/accounting-documents/${token}`)
            .then((res) => setDocument(res.data))
            .catch(() => setUnavailable(true))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
                <Loader size="large" />
            </div>
        );
    }

    if (unavailable || !document) {
        return (
            <div style={{ maxWidth: 640, margin: '80px auto', padding: 16 }}>
                <Alert
                    type="warning"
                    showIcon
                    message="Ссылка недействительна"
                    description="Документ не найден или доступ по этой ссылке отозван. Запросите новую ссылку у отправителя."
                />
            </div>
        );
    }

    const openPdf = () => {
        const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        window.open(`${base}/public/accounting-documents/${token}/pdf`, '_blank', 'noopener');
    };

    const isReconciliation = document.type === 'RECONCILIATION_ACT';

    return (
        <div style={{ maxWidth: 1000, margin: '32px auto', padding: 16 }}>
            <Card
                style={{ borderRadius: 8 }}
                title={
                    <div>
                        <Title level={4} style={{ margin: 0 }}>
                            {TYPE_LABELS[document.type] || 'Документ'} № {document.number}
                        </Title>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            от {dayjs(document.documentDate).format('DD.MM.YYYY')}
                        </Text>
                    </div>
                }
                extra={<Button icon={<PrinterOutlined />} onClick={openPdf}>Печать</Button>}
            >
                <Descriptions column={1} size="small" bordered style={{ marginBottom: 20 }}>
                    <Descriptions.Item label="Исполнитель">{party(document.issuerSnapshot)}</Descriptions.Item>
                    <Descriptions.Item label="Заказчик">{party(document.recipientSnapshot)}</Descriptions.Item>
                    {document.dueDate && (
                        <Descriptions.Item label="Срок оплаты">
                            {dayjs(document.dueDate).format('DD.MM.YYYY')}
                        </Descriptions.Item>
                    )}
                </Descriptions>

                {!isReconciliation && (
                    <Table
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={document.lines || []}
                        columns={[
                            { title: '№', dataIndex: 'lineNumber', width: 50 },
                            { title: 'Наименование', dataIndex: 'name' },
                            { title: 'Кол-во', dataIndex: 'quantity', width: 80, align: 'right' as const },
                            { title: 'Ед.', dataIndex: 'unit', width: 60 },
                            {
                                title: 'Цена', dataIndex: 'unitPrice', width: 130, align: 'right' as const,
                                render: (v: number) => money(v),
                            },
                            {
                                title: 'Сумма', dataIndex: 'total', width: 140, align: 'right' as const,
                                render: (v: number) => <strong>{money(v)}</strong>,
                            },
                        ]}
                    />
                )}

                <div style={{ marginTop: 20, textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: theme_.colorTextSecondary }}>
                        В том числе НДС: {money(document.vatTotal)}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                        Итого к оплате: {money(document.total)}
                    </div>
                </div>
            </Card>
        </div>
    );
}
