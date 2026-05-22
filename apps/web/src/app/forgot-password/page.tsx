'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import InteractiveBackground from '@/components/ui/InteractiveBackground';

const { Title, Text } = Typography;

export default function ForgotPasswordPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);

    const handleFinish = async (values: { email: string }) => {
        setLoading(true);
        try {
            await api.post('/auth/forgot-password', { email: values.email });
            setIsSent(true);
            message.success('Инструкции отправлены на почту');
        } catch (error: any) {
            // Even on error we might want to say it's sent for security, 
            // but if it's a network error we can show it
            message.error(error.response?.data?.message || 'Ошибка отправки запроса');
        } finally {
            setLoading(false);
        }
    };

    return (
        <InteractiveBackground>
            <Card
                style={{
                    width: '100%',
                    maxWidth: 420,
                    borderRadius: 16,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <Title level={3} style={{ margin: 0, color: '#1677ff' }}>
                        Восстановление пароля
                    </Title>
                    <Text type="secondary">
                        {isSent 
                            ? 'Проверьте вашу почту'
                            : 'Введите email, указанный при регистрации'
                        }
                    </Text>
                </div>

                {!isSent ? (
                    <Form layout="vertical" onFinish={handleFinish}>
                        <Form.Item
                            name="email"
                            rules={[
                                { required: true, message: 'Введите email' },
                                { type: 'email', message: 'Некорректный email' },
                            ]}
                        >
                            <Input
                                prefix={<UserOutlined />}
                                placeholder="Ваш Email"
                                size="large"
                            />
                        </Form.Item>

                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                size="large"
                                block
                                loading={loading}
                            >
                                Отправить ссылку
                            </Button>
                        </Form.Item>
                        <div style={{ textAlign: 'center' }}>
                            <Button type="link" onClick={() => router.push('/login')} icon={<ArrowLeftOutlined />}>
                                Вернуться к входу
                            </Button>
                        </div>
                    </Form>
                ) : (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ marginBottom: 24, fontSize: 16 }}>
                            Если аккаунт с таким email существует, мы отправили на него ссылку для восстановления пароля.
                        </p>
                        <Button
                            type="primary"
                            size="large"
                            block
                            onClick={() => router.push('/login')}
                        >
                            Вернуться к входу
                        </Button>
                    </div>
                )}
            </Card>
        </InteractiveBackground>
    );
}
