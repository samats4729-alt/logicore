'use client';

import { useState } from 'react';
import { Modal, Form, App } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import LocationForm from './LocationForm';
import { api, Location } from '@/lib/api';

interface QuickCreateLocationModalProps {
    open: boolean;
    onCancel: () => void;
    onSuccess: (location: Location) => void;
    defaultCompanyId?: string;
    customerCompany?: { id: string; name: string };
    carrierCompany?: { id: string; name: string };
}

export default function QuickCreateLocationModal({
    open,
    onCancel,
    onSuccess,
    defaultCompanyId,
    customerCompany,
    carrierCompany
}: QuickCreateLocationModalProps) {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            const payload = {
                ...values,
                emails: values.emails ? values.emails.join(',') : null
            };

            const response = await api.post('/locations', payload);
            message.success('Адрес успешно добавлен');
            onSuccess(response.data);
            form.resetFields();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения адреса');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                        width: 36, height: 36, borderRadius: 10,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: '#eef4ff', color: '#1677ff', fontSize: 18,
                    }}>
                        <EnvironmentOutlined />
                    </span>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>Новый адрес</div>
                        <div style={{ fontSize: 12, color: 'var(--lc-text-ter)', fontWeight: 400 }}>
                            Страна, город и улица — карта сама найдёт точку
                        </div>
                    </div>
                </div>
            }
            open={open}
            onCancel={() => {
                form.resetFields();
                onCancel();
            }}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText="Сохранить адрес"
            cancelText="Отмена"
            width={850}
            centered
            destroyOnClose
            style={{ minWidth: 800 }}
        >
            <div style={{ marginTop: 16 }}>
                <LocationForm
                    form={form}
                    onFinish={handleSubmit}
                    defaultCompanyId={defaultCompanyId}
                    showCompanySelect={true}
                    customerCompany={customerCompany}
                    carrierCompany={carrierCompany}
                />
            </div>
        </Modal>
    );
}
