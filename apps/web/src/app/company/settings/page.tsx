'use client';

import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Divider, Space } from 'antd';
import { LockOutlined, UserOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

export default function SettingsPage() {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();

    const handleProfileUpdate = async (values: any) => {
        setLoading(true);
        try {
            await api.put('/users/profile', values);
            message.success('Профиль обновлён');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка обновления профиля');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error('Пароли не совпадают');
            return;
        }

        setPasswordLoading(true);
        try {
            await api.put('/users/password', {
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            });
            message.success('Пароль успешно изменён');
            passwordForm.resetFields();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка изменения пароля');
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <div>
            <Title level={3}>Настройки</Title>

            {/* Профиль */}
            <Card title="Профиль" style={{ marginBottom: 24 }}>
                <Form
                    form={profileForm}
                    layout="vertical"
                    onFinish={handleProfileUpdate}
                    initialValues={{
                        firstName: user?.firstName,
                        lastName: user?.lastName,
                        email: user?.email,
                        phone: user?.phone,
                    }}
                >
                    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 600 }}>
                        <Form.Item
                            name="firstName"
                            label="Имя"
                            rules={[{ required: true, message: 'Введите имя' }]}
                        >
                            <Input prefix={<UserOutlined />} size="large" />
                        </Form.Item>

                        <Form.Item
                            name="lastName"
                            label="Фамилия"
                            rules={[{ required: true, message: 'Введите фамилию' }]}
                        >
                            <Input prefix={<UserOutlined />} size="large" />
                        </Form.Item>

                        <Form.Item
                            name="email"
                            label="Email"
                        >
                            <Input prefix={<MailOutlined />} size="large" disabled />
                        </Form.Item>

                        <Form.Item
                            name="phone"
                            label="Телефон"
                        >
                            <Input prefix={<PhoneOutlined />} size="large" disabled />
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={loading} size="large">
                                Сохранить изменения
                            </Button>
                        </Form.Item>
                    </Space>
                </Form>
            </Card>

            {/* Смена пароля */}
            <Card title="Изменить пароль">
                <Form
                    form={passwordForm}
                    layout="vertical"
                    onFinish={handlePasswordChange}
                >
                    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 600 }}>
                        <Form.Item
                            name="currentPassword"
                            label="Текущий пароль"
                            rules={[{ required: true, message: 'Введите текущий пароль' }]}
                        >
                            <Input.Password prefix={<LockOutlined />} size="large" />
                        </Form.Item>

                        <Form.Item
                            name="newPassword"
                            label="Новый пароль"
                            rules={[
                                { required: true, message: 'Введите новый пароль' },
                                { min: 6, message: 'Минимум 6 символов' },
                            ]}
                        >
                            <Input.Password prefix={<LockOutlined />} size="large" />
                        </Form.Item>

                        <Form.Item
                            name="confirmPassword"
                            label="Подтвердите новый пароль"
                            rules={[{ required: true, message: 'Подтвердите пароль' }]}
                        >
                            <Input.Password prefix={<LockOutlined />} size="large" />
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={passwordLoading} size="large">
                                Изменить пароль
                            </Button>
                        </Form.Item>
                    </Space>
                </Form>
            </Card>
        </div>
    );
}
