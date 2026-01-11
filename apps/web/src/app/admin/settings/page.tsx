'use client';

import { useState } from 'react';
import { Card, Typography, Form, Input, Button, Switch, Divider, Space, App, Tabs } from 'antd';
import {
    SettingOutlined,
    UserOutlined,
    LockOutlined,
    BellOutlined,
    SaveOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

export default function SettingsPage() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);

    const handleSaveProfile = async (values: any) => {
        setLoading(true);
        try {
            // TODO: Implement API call
            await new Promise(resolve => setTimeout(resolve, 500));
            message.success('Профиль сохранён');
        } catch (error) {
            message.error('Ошибка сохранения');
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error('Пароли не совпадают');
            return;
        }
        setLoading(true);
        try {
            // TODO: Implement API call
            await new Promise(resolve => setTimeout(resolve, 500));
            message.success('Пароль изменён');
        } catch (error) {
            message.error('Ошибка изменения пароля');
        } finally {
            setLoading(false);
        }
    };

    const tabItems = [
        {
            key: 'profile',
            label: (
                <span>
                    <UserOutlined />
                    Профиль
                </span>
            ),
            children: (
                <Card>
                    <Form
                        layout="vertical"
                        onFinish={handleSaveProfile}
                        initialValues={{
                            firstName: 'Admin',
                            lastName: 'System',
                            email: 'admin@logicore.kz',
                        }}
                    >
                        <Form.Item label="Имя" name="firstName" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item label="Фамилия" name="lastName" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email' }]}>
                            <Input disabled />
                        </Form.Item>
                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                                Сохранить
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            ),
        },
        {
            key: 'security',
            label: (
                <span>
                    <LockOutlined />
                    Безопасность
                </span>
            ),
            children: (
                <Card>
                    <Form layout="vertical" onFinish={handleChangePassword}>
                        <Form.Item
                            label="Текущий пароль"
                            name="currentPassword"
                            rules={[{ required: true }]}
                        >
                            <Input.Password />
                        </Form.Item>
                        <Form.Item
                            label="Новый пароль"
                            name="newPassword"
                            rules={[{ required: true, min: 8 }]}
                        >
                            <Input.Password />
                        </Form.Item>
                        <Form.Item
                            label="Подтверждение пароля"
                            name="confirmPassword"
                            rules={[{ required: true }]}
                        >
                            <Input.Password />
                        </Form.Item>
                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                                Изменить пароль
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            ),
        },
        {
            key: 'notifications',
            label: (
                <span>
                    <BellOutlined />
                    Уведомления
                </span>
            ),
            children: (
                <Card>
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <Text strong>Email уведомления</Text>
                                <br />
                                <Text type="secondary">Получать уведомления о новых заявках на email</Text>
                            </div>
                            <Switch defaultChecked />
                        </div>
                        <Divider />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <Text strong>Push уведомления</Text>
                                <br />
                                <Text type="secondary">Уведомления в браузере</Text>
                            </div>
                            <Switch />
                        </div>
                        <Divider />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <Text strong>SMS уведомления</Text>
                                <br />
                                <Text type="secondary">Критичные уведомления по SMS</Text>
                            </div>
                            <Switch />
                        </div>
                    </Space>
                </Card>
            ),
        },
    ];

    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <Title level={4} style={{ margin: 0 }}>
                    <SettingOutlined style={{ marginRight: 8 }} />
                    Настройки
                </Title>
            </div>

            <Tabs items={tabItems} />
        </div>
    );
}
