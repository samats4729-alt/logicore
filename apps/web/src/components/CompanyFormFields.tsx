'use client';

import { Form, Input, message, Spin } from 'antd';
import { api } from '@/lib/api';
import { useState } from 'react';

interface CompanyFormFieldsProps {
    form: any;
    isSettings?: boolean; // If true, maps name to 'name' instead of 'companyName'
}

export default function CompanyFormFields({ form, isSettings = false }: CompanyFormFieldsProps) {
    const [lookupLoading, setLookupLoading] = useState(false);

    const handleBinChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const binValue = e.target.value;
        if (/^\d{12}$/.test(binValue)) {
            setLookupLoading(true);
            try {
                const res = await api.get(`/auth/company-lookup/${binValue}`);
                if (res.data) {
                    const updateVals: any = {};
                    const nameKey = isSettings ? 'name' : 'companyName';
                    if (res.data.name) updateVals[nameKey] = res.data.name;
                    if (res.data.phone) updateVals.phone = res.data.phone;
                    if (res.data.email) {
                        if (isSettings) updateVals.email = res.data.email;
                        else updateVals.adminEmail = res.data.email;
                    }
                    if (isSettings && res.data.address) {
                        updateVals.address = res.data.address;
                        updateVals.actualAddress = res.data.address;
                    }
                    if (isSettings && res.data.directorName) {
                        updateVals.directorName = res.data.directorName;
                    }

                    form.setFieldsValue(updateVals);
                    message.success(`Данные компании подтянуты: ${res.data.name}`);
                }
            } catch (err) {
                // Ignore error to avoid blocking user flow
            } finally {
                setLookupLoading(false);
            }
        }
    };

    const nameFieldName = isSettings ? 'name' : 'companyName';

    return (
        <>
            <Form.Item
                name="bin"
                label="БИН компании"
                rules={[
                    { required: true, message: 'Введите БИН' },
                    { len: 12, message: 'БИН должен содержать 12 цифр' },
                    { pattern: /^\d{12}$/, message: 'БИН должен состоять только из цифр' },
                ]}
            >
                <Input 
                    placeholder="123456789012" 
                    size="large" 
                    maxLength={12} 
                    onChange={handleBinChange}
                    suffix={lookupLoading ? <Spin size="small" /> : null}
                    onKeyPress={(e) => { if (!/\d/.test(e.key)) e.preventDefault(); }}
                />
            </Form.Item>

            <Form.Item
                name={nameFieldName}
                label="Название компании"
                rules={[{ required: true, message: 'Введите название' }]}
            >
                <Input placeholder="ТОО КазЛогистик" size="large" />
            </Form.Item>
        </>
    );
}
