'use client';

import { useState } from 'react';
import { Card, Table, Button, Tag, Space, Input, Select, Empty, Typography } from 'antd';
import { FileOutlined, DownloadOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
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
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={3}>Документы</Title>
                <Button type="primary" icon={<UploadOutlined />}>
                    Загрузить документ
                </Button>
            </div>

            <Card>
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
                            pagination={{ pageSize: 20 }}
                        />
                    )}
                </Space>
            </Card>
        </div>
    );
}
