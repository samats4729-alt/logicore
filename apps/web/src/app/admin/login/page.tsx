'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, Typography, message, Layout } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';

const { Title, Text } = Typography;
const { Content } = Layout;

export default function AdminLoginPage() {
    const router = useRouter();
    const { login, user, logout } = useAuthStore();
    const [loading, setLoading] = useState(false);

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            // 1. Perform standard login
            await login(values.email, values.password, 'web-admin');

            // 2. We can't immediately check 'user' from store here because state updates are async/batched.
            // CheckAuth or the login response usually handles setting the user.
            // However, after await login(), the store state for user MIGHT be updated or we need to rely on the API response.
            // Since useAuthStore.login returns void/throws, we rely on the implementation.

            // Let's do a quick check via a direct store access or just redirect to layout which checks it.
            // But better UX is to check right here.

            // Re-accessing the store state directly from the hook won't work inside the function closure effectively if it's stale.
            // So we will trust the Layout to kick us out if we are not admin, 
            // OR we can explicitly fetch "me" here if we want to be super sure.

            // Let's rely on the layout redirect for simplicity, BUT for better UX let's try to verify.

            router.push('/admin');
            message.success('Добро пожаловать в Панель Администратора');
        } catch (error: any) {
            console.error(error);
            if (error.response?.status === 401) {
                message.error('Неверный логин или пароль');
            } else {
                message.error('Ошибка входа');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
            <Content style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Card
                    style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: 8 }}
                    bordered={false}
                >
                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                        <SafetyCertificateOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
                        <Title level={3}>Admin Panel</Title>
                        <Text type="secondary">Вход только для сотрудников LogiCore</Text>
                    </div>

                    <Form
                        name="admin_login"
                        onFinish={onFinish}
                        layout="vertical"
                        size="large"
                    >
                        <Form.Item
                            name="email"
                            rules={[{ required: true, message: 'Введите Email' }, { type: 'email', message: 'Некорректный Email' }]}
                        >
                            <Input prefix={<UserOutlined />} placeholder="Email" />
                        </Form.Item>

                        <Form.Item
                            name="password"
                            rules={[{ required: true, message: 'Введите пароль' }]}
                        >
                            <Input.Password prefix={<LockOutlined />} placeholder="Пароль" />
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" block loading={loading}>
                                Войти
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            </Content>
        </Layout>
    );
}
