'use client';

import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Input, Select, DatePicker, Upload, message, App, Dropdown, Modal } from 'antd';
import {
    FileTextOutlined,
    DownloadOutlined,
    EyeOutlined,
    DeleteOutlined,
    UploadOutlined,
    SearchOutlined,
    FilterOutlined,
    MoreOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface Document {
    id: string;
    type: string;
    number?: string;
    orderId?: string;
    orderNumber?: string;
    filePath?: string;
    createdAt: string;
    order?: {
        orderNumber: string;
    };
}

const documentTypes: Record<string, { label: string; color: string }> = {
    WAYBILL: { label: 'Накладная', color: 'blue' },
    INVOICE: { label: 'Счёт', color: 'green' },
    ACT: { label: 'Акт', color: 'purple' },
    CONTRACT: { label: 'Договор', color: 'orange' },
    TTN: { label: 'ТТН', color: 'cyan' },
    OTHER: { label: 'Другое', color: 'default' },
};

export default function DocumentsPage() {
    const { message: msg } = App.useApp();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const response = await api.get('/documents');
            setDocuments(response.data);
        } catch (error) {
            console.error(error);
            // msg.error('Не удалось загрузить документы');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    const handleDownload = async (doc: Document) => {
        if (!doc.filePath) {
            msg.warning('Файл недоступен');
            return;
        }
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            window.open(`${apiUrl}${doc.filePath}`, '_blank');
        } catch (error) {
            msg.error('Ошибка скачивания');
        }
    };

    const handleDelete = async (id: string) => {
        Modal.confirm({
            title: 'Удалить документ?',
            content: 'Это действие нельзя отменить',
            okText: 'Удалить',
            okType: 'danger',
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    await api.delete(`/documents/${id}`);
                    msg.success('Документ удалён');
                    fetchDocuments();
                } catch (error) {
                    msg.error('Не удалось удалить документ');
                }
            },
        });
    };

    const filteredDocuments = documents.filter(doc => {
        const matchesSearch = searchText
            ? (doc.number?.toLowerCase().includes(searchText.toLowerCase()) ||
                doc.order?.orderNumber?.toLowerCase().includes(searchText.toLowerCase()))
            : true;
        const matchesType = typeFilter ? doc.type === typeFilter : true;
        return matchesSearch && matchesType;
    });

    const columns = [
        {
            title: 'Тип',
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => {
                const typeInfo = documentTypes[type] || documentTypes.OTHER;
                return <Tag color={typeInfo.color}>{typeInfo.label}</Tag>;
            },
        },
        {
            title: 'Номер',
            dataIndex: 'number',
            key: 'number',
            render: (number: string) => number || '—',
        },
        {
            title: 'Заявка',
            key: 'order',
            render: (_: any, record: Document) =>
                record.order?.orderNumber ? (
                    <Tag>{record.order.orderNumber}</Tag>
                ) : '—',
        },
        {
            title: 'Дата создания',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm'),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Document) => (
                <Space>
                    <Button
                        type="text"
                        icon={<DownloadOutlined />}
                        onClick={() => handleDownload(record)}
                        disabled={!record.filePath}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                    />
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <Title level={4} style={{ margin: 0 }}>
                    <FileTextOutlined style={{ marginRight: 8 }} />
                    Документы
                </Title>
            </div>

            <Card>
                <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
                    <Input
                        placeholder="Поиск по номеру..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ width: 200 }}
                    />
                    <Select
                        placeholder="Тип документа"
                        allowClear
                        style={{ width: 150 }}
                        value={typeFilter}
                        onChange={setTypeFilter}
                        options={Object.entries(documentTypes).map(([key, val]) => ({
                            value: key,
                            label: val.label,
                        }))}
                    />
                </Space>

                <Table
                    columns={columns}
                    dataSource={filteredDocuments}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{ emptyText: 'Нет документов' }}
                />
            </Card>
        </div>
    );
}
