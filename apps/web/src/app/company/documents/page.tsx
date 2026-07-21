'use client';

import { useState } from 'react';
import { Table, Button, Tag, Space, Input, Select, Empty } from 'antd';
import { FileOutlined, DownloadOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons';

const { Search } = Input;

interface Document {
    id: string;
    type: string;
    orderNumber?: string;
    fileName: string;
    uploadedAt: string;
    size: string;
}

export default function DocumentsPage() {
    const [documents] = useState<Document[]>([]);
    const [loading] = useState(false);

    const columns = [
        {
            title: 'Тип документа',
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => {
                const colors: Record<string, string> = {
                    'TTN': 'blue',
                    'Invoice': 'green',
                    'Contract': 'purple',
                    'Other': 'default',
                };
                return <Tag color={colors[type] || 'default'}>{type}</Tag>;
            },
        },
        {
            title: 'Заявка',
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            render: (num: string) => num || '—',
        },
        {
            title: 'Файл',
            dataIndex: 'fileName',
            key: 'fileName',
        },
        {
            title: 'Размер',
            dataIndex: 'size',
            key: 'size',
        },
        {
            title: 'Дата загрузки',
            dataIndex: 'uploadedAt',
            key: 'uploadedAt',
        },
        {
            title: 'Действия',
            key: 'actions',
            render: () => (
                <Space>
                    <Button icon={<EyeOutlined />} size="small">Просмотр</Button>
                    <Button icon={<DownloadOutlined />} size="small">Скачать</Button>
                </Space>
            ),
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Справочники · Документы</div>
                    <h1 className="lc2-title">Документы</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Загруженные файлы — ТТН, счета, договоры и прочие документы
                    </p>
                    <Button type="primary" icon={<UploadOutlined />} className="lc-cta">
                        Загрузить документ
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6f7ff', color: '#1890ff' }}>
                            <FileOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Всего документов</div>
                            <div className="lc2-mvalue">{documents.length}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== CONTENT CARD ===== */}
            <div className="lc-card" style={{ padding: 20 }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Space>
                        <Search
                            placeholder="Поиск по номеру заявки..."
                            style={{ width: 250 }}
                        />
                        <Select placeholder="Тип документа" style={{ width: 180 }} allowClear>
                            <Select.Option value="TTN">ТТН</Select.Option>
                            <Select.Option value="Invoice">Счёт</Select.Option>
                            <Select.Option value="Contract">Договор</Select.Option>
                            <Select.Option value="Other">Другое</Select.Option>
                        </Select>
                    </Space>

                    {documents.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="Нет загруженных документов"
                        >
                            <Button type="primary" icon={<UploadOutlined />}>
                                Загрузить первый документ
                            </Button>
                        </Empty>
                    ) : (
                        <Table
                            columns={columns}
                            dataSource={documents}
                            rowKey="id"
                            loading={loading}
                            size="small"
                            pagination={{ pageSize: 20 }}
                        />
                    )}
                </Space>
            </div>
        </div>
    );
}
