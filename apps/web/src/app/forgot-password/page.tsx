'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, App } from 'antd';
import { UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import AuthShell from '@/components/AuthShell';

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
        <AuthShell
            eyebrow="(03 — Восстановление)"
            title={<>Вернём <em>доступ</em>.</>}
            subtitle="Пришлём на почту ссылку для сброса пароля — это занимает меньше минуты."
        >
                <div className="lc-auth-card-head">
                    <div className="lc-auth-card-title">Восстановление пароля</div>
                    <div className="lc-auth-card-sub">
                        {isSent
                            ? 'Проверьте вашу почту'
                            : 'Введите email, указанный при регистрации'
                        }
                    </div>
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
        </AuthShell>
    );
}
