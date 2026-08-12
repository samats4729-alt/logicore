'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Input, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, FolderAddOutlined } from '@ant-design/icons';
import { Boxes } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';
import nova from '@/components/nova/nova.module.css';
import styles from './cargo-types.module.css';

/**
 * Справочник грузов: категории и типы внутри них.
 *
 * Из него выбирают груз в заявке, поэтому список общий на всю платформу —
 * заводит его владелец. Экран был на белых карточках Ant Design с серыми
 * плашками, записанными цветом прямо в разметке; в тёмной теме от них
 * оставались белые пятна.
 */

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
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Справочник</div>
                    <h1 className={nova.title}>Виды груза</h1>
                    <p className={nova.subtitle}>
                        Из этого списка выбирают груз в заявке. Он общий на всю платформу:
                        категория — крупными словами, типы внутри — тем языком, которым груз
                        называют в накладной.
                    </p>
                </div>
                <div className={nova.heroActions}>
                    <button
                        type="button"
                        className={`${nova.action} ${nova.actionPrimary}`}
                        onClick={() => setIsCategoryModalOpen(true)}
                    >
                        <FolderAddOutlined /> Категория
                    </button>
                </div>
            </div>

            {loading && categories.length === 0 && (
                <div className={nova.empty}><Loader size="large" /></div>
            )}

            {!loading && categories.length === 0 && (
                <div className={nova.empty}>
                    Справочник пуст — заведите первую категорию, иначе в заявке нечего выбрать.
                </div>
            )}

            {categories.map(category => (
                <section className={nova.card} key={category.id}>
                    <div className={nova.cardHead}>
                        <Boxes size={14} />
                        <h2 className={nova.cardTitle}>{category.name}</h2>
                        <span className={nova.cardCount}>{category.types?.length || 0}</span>
                        <Popconfirm
                            title="Удалить категорию и все типы в ней?"
                            okText="Удалить"
                            cancelText="Отмена"
                            onConfirm={() => handleDeleteCategory(category.id)}
                        >
                            <button type="button" className={`${nova.action} ${nova.actionDanger}`}>
                                <DeleteOutlined /> Удалить
                            </button>
                        </Popconfirm>
                    </div>
                    <div className={nova.cardBody}>
                        <div className={styles.types}>
                            {(category.types || []).map((item: any) => (
                                <span className={styles.type} key={item.id}>
                                    {item.name}
                                    <Popconfirm
                                        title="Удалить этот тип?"
                                        okText="Удалить"
                                        cancelText="Отмена"
                                        onConfirm={() => handleDeleteType(item.id)}
                                    >
                                        <button type="button" className={styles.typeDrop} aria-label="Удалить тип">
                                            <DeleteOutlined />
                                        </button>
                                    </Popconfirm>
                                </span>
                            ))}
                            {(category.types || []).length === 0 && (
                                <span className={nova.itemDesc}>В категории пока нет типов</span>
                            )}
                        </div>
                        <button
                            type="button"
                            className={nova.action}
                            style={{ marginTop: 12 }}
                            onClick={() => openTypeModal(category.id)}
                        >
                            <PlusOutlined /> Тип в «{category.name}»
                        </button>
                    </div>
                </section>
            ))}

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
