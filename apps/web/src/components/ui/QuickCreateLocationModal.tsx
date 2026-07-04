'use client';

import { useState } from 'react';
import { Modal, Form, App } from 'antd';
import LocationForm from './LocationForm';
import { api, Location } from '@/lib/api';

interface QuickCreateLocationModalProps {
    open: boolean;
    onCancel: () => void;
    onSuccess: (location: Location) => void;
    defaultCompanyId?: string;
}

export default function QuickCreateLocationModal({
    open,
    onCancel,
    onSuccess,
    defaultCompanyId
}: QuickCreateLocationModalProps) {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            // countryId/regionId are cascade-only helper fields, backend doesn't accept them
            const { countryId, regionId, ...restValues } = values;
            const payload = {
                ...restValues,
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
            title="Добавление нового адреса"
            open={open}
            onCancel={() => {
                form.resetFields();
                onCancel();
            }}
            onOk={() => form.submit()}
            confirmLoading={submitting}
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
                />
            </div>
        </Modal>
    );
}
