'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Table, Modal, Form, Input, Select, Space, Typography, Popconfirm, Collapse, List } from 'antd';
import { PlusOutlined, DeleteOutlined, FolderAddOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const { Title, Text } = Typography;
const { Panel } = Collapse;

export default function AdminCargoTypesPage() {
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Modals
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

    const [categoryForm] = Form.useForm();
    const [typeForm] = Form.useForm();

    const fetchCargoTypes = async () => {
        setLoading(true);
        try {
            const response = await api.get('/cargo-types');
            setCategories(response.data);
        } catch (error) {
            toast.error('Ошибка загрузки типов грузов');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCargoTypes();
    }, []);

    const handleCreateCategory = async (values: { name: string }) => {
        try {
            await api.post('/cargo-types/categories', values);
            toast.success('Категория создана');
            setIsCategoryModalOpen(false);
            categoryForm.resetFields();
            fetchCargoTypes();
        } catch (error) {
            toast.error('Ошибка создания категории');
        }
    };

    const handleCreateType = async (values: { name: string }) => {
        if (!selectedCategoryId) return;
        try {
            await api.post('/cargo-types/types', { ...values, categoryId: selectedCategoryId });
            toast.success('Тип груза добавлен');
            setIsTypeModalOpen(false);
            typeForm.resetFields();
            fetchCargoTypes();
        } catch (error) {
            toast.error('Ошибка добавления типа');
        }
    };

    const handleDeleteCategory = async (id: string) => {
        try {
            await api.delete(`/cargo-types/categories/${id}`);
            toast.success('Категория удалена');
            fetchCargoTypes();
        } catch (error) {
            toast.error('Ошибка удаления категории');
        }
    };

    const handleDeleteType = async (id: string) => {
        try {
            await api.delete(`/cargo-types/types/${id}`);
            toast.success('Тип удалён');
            fetchCargoTypes();
        } catch (error) {
            toast.error('Ошибка удаления типа');
        }
    };

    const openTypeModal = (categoryId: string) => {
        setSelectedCategoryId(categoryId);
        setIsTypeModalOpen(true);
    };

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Title level={2}>Справочник типов грузов</Title>
                <Button type="primary" icon={<FolderAddOutlined />} onClick={() => setIsCategoryModalOpen(true)}>
                    Добавить категорию
                </Button>
            </div>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {categories.map(category => (
                    <Card
                        key={category.id}
                        title={<span style={{ fontSize: 18, fontWeight: 'bold' }}>{category.name}</span>}
                        extra={
                            <Popconfirm title="Удалить категорию и все типы в ней?" onConfirm={() => handleDeleteCategory(category.id)}>
                                <Button danger type="text" icon={<DeleteOutlined />}>Удалить категорию</Button>
                            </Popconfirm>
                        }
                        size="small"
                    >
                        <List
                            grid={{ gutter: 16, column: 4 }}
                            dataSource={category.types}
                            renderItem={(item: any) => (
                                <List.Item>
                                    <div style={{
                                        padding: '8px 12px',
                                        background: '#f5f5f5',
                                        borderRadius: 6,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        border: '1px solid #eee'
                                    }}>
                                        <Text>{item.name}</Text>
                                        <Popconfirm title="Удалить этот тип?" onConfirm={() => handleDeleteType(item.id)}>
                                            <DeleteOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }} />
                                        </Popconfirm>
                                    </div>
                                </List.Item>
                            )}
                        />
                        <Button type="dashed" block icon={<PlusOutlined />} onClick={() => openTypeModal(category.id)} style={{ marginTop: 12 }}>
                            Добавить тип в "{category.name}"
                        </Button>
                    </Card>
                ))}
            </Space>

            {/* Modal: Create Category */}
            <Modal
                title="Новая категория"
                open={isCategoryModalOpen}
                onCancel={() => setIsCategoryModalOpen(false)}
                onOk={() => categoryForm.submit()}
            >
                <Form form={categoryForm} onFinish={handleCreateCategory} layout="vertical">
                    <Form.Item name="name" label="Название категории" rules={[{ required: true }]}>
                        <Input placeholder="Например: Продукты питания" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal: Create Type */}
            <Modal
                title="Новый тип груза"
                open={isTypeModalOpen}
                onCancel={() => setIsTypeModalOpen(false)}
                onOk={() => typeForm.submit()}
            >
                <Form form={typeForm} onFinish={handleCreateType} layout="vertical">
                    <Form.Item name="name" label="Название типа" rules={[{ required: true }]}>
                        <Input placeholder="Например: Молочная продукция" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
