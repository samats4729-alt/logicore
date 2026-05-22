'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Form, Input, Button, Card, Typography, App } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import InteractiveBackground from '@/components/ui/InteractiveBackground';

const { Title, Text } = Typography;

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    
    const token = searchParams.get('token');

    useEffect(() => {
        if (!token) {
            message.error('Неверная ссылка для восстановления пароля');
            router.push('/login');
        }
    }, [token, router, message]);

    const handleFinish = async (values: any) => {
        if (!token) return;
        
        setLoading(true);
        try {
            await api.post('/auth/reset-password', { 
                token, 
                newPassword: values.password 
            });
            setIsSuccess(true);
            message.success('Пароль успешно изменен');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сброса пароля. Возможно ссылка устарела.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) return null;

    return (
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
                    Новый пароль
                </Title>
                <Text type="secondary">
                    {isSuccess 
                        ? 'Пароль успешно обновлен'
                        : 'Придумайте новый надежный пароль'
                    }
                </Text>
            </div>

            {!isSuccess ? (
                <Form layout="vertical" onFinish={handleFinish}>
                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: 'Введите новый пароль' },
                            { min: 6, message: 'Пароль должен содержать минимум 6 символов' }
                        ]}
                        hasFeedback
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="Новый пароль"
                            size="large"
                        />
                    </Form.Item>

                    <Form.Item
                        name="confirmPassword"
                        dependencies={['password']}
                        hasFeedback
                        rules={[
                            { required: true, message: 'Повторите пароль' },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('password') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('Пароли не совпадают'));
                                },
                            }),
                        ]}
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="Повторите пароль"
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
                            Сохранить пароль
                        </Button>
                    </Form.Item>
                </Form>
            ) : (
                <div style={{ textAlign: 'center' }}>
                    <p style={{ marginBottom: 24, fontSize: 16 }}>
                        Вы можете войти в систему с новым паролем.
                    </p>
                    <Button
                        type="primary"
                        size="large"
                        block
                        onClick={() => router.push('/login')}
                    >
                        Войти
                    </Button>
                </div>
            )}
        </Card>
    );
}

export default function ResetPasswordPage() {
    return (
        <InteractiveBackground>
            <Suspense fallback={<div>Загрузка...</div>}>
                <ResetPasswordForm />
            </Suspense>
        </InteractiveBackground>
    );
}
