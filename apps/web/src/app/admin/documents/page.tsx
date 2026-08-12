'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Space, Input, Select, Modal } from 'antd';
import { DownloadOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { FolderOpen } from 'lucide-react';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';

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

// Виды документов — те же, что в системе (enum DocumentType). Раньше здесь
// стояли «Накладная» и «Договор», которых в системе нет, а настоящих видов
// не было: каждый документ подписывался «Другое», и фильтр предлагал выбрать
// то, чего не бывает.
const documentTypes: Record<string, { label: string }> = {
    TTN: { label: 'ТТН' },
    POWER_OF_ATTORNEY: { label: 'Доверенность' },
    ACT: { label: 'Акт' },
    INVOICE: { label: 'Счёт' },
    COMPANY_REGISTRATION: { label: 'Справка о регистрации' },
    DIRECTOR_APPOINTMENT: { label: 'Приказ о руководителе' },
    DIRECTOR_ID: { label: 'Удостоверение руководителя' },
    OTHER: { label: 'Другое' },
};

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            // Журнал по всем компаниям. Обычный `/documents` отбирает по
            // компании запросившего, а у администратора платформы её нет —
            // экран отвечал отказом и всегда показывал «Нет документов».
            const response = await api.get('/documents/all');
            setDocuments(response.data);
        } catch (error) {
            console.error(error);
            toast.error('Не удалось загрузить документы');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    const handleDownload = async (doc: Document) => {
        if (!doc.filePath) {
            toast.warning('Файл недоступен');
            return;
        }
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            window.open(`${apiUrl}${doc.filePath}`, '_blank');
        } catch (error) {
            toast.error('Ошибка скачивания');
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
                    toast.success('Документ удалён');
                    fetchDocuments();
                } catch (error) {
                    toast.error('Не удалось удалить документ');
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
            render: (type: string) => (
                <span className={nova.chip}>{(documentTypes[type] || documentTypes.OTHER).label}</span>
            ),
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
                    <span className={nova.chip}>{record.order.orderNumber}</span>
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
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Документы</h1>
                    <p className={nova.subtitle}>
                        Все файлы, приложенные к рейсам и организациям на платформе.
                    </p>
                </div>
            </div>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <FolderOpen size={14} />
                    <h2 className={nova.cardTitle}>Файлы</h2>
                    {filteredDocuments.length > 0 && (
                        <span className={nova.cardCount}>{filteredDocuments.length}</span>
                    )}
                    <Space wrap>
                        <Input
                            placeholder="Поиск по номеру"
                            prefix={<SearchOutlined />}
                            allowClear
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            style={{ width: 200 }}
                        />
                        <Select
                            placeholder="Вид документа"
                            allowClear
                            style={{ width: 180 }}
                            value={typeFilter}
                            onChange={setTypeFilter}
                            options={Object.entries(documentTypes).map(([key, val]) => ({
                                value: key,
                                label: val.label,
                            }))}
                        />
                    </Space>
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredDocuments}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    size="small"
                    locale={{
                        emptyText: searchText || typeFilter
                            ? 'По такому отбору документов нет'
                            : 'Документов пока нет',
                    }}
                />
            </section>
        </div>
    );
}
