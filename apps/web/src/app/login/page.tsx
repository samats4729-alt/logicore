'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, Typography, App, Tabs, Divider } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, GoogleOutlined } from '@ant-design/icons';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import InteractiveBackground from '@/components/ui/InteractiveBackground';
import { v4 as uuidv4 } from 'uuid';

const { Title, Text } = Typography;

export default function LoginPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const { login, setUser } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [smsStep, setSmsStep] = useState<'phone' | 'code'>('phone');
    const [phoneNumber, setPhoneNumber] = useState('');

    // Device ID для Single Session Policy
    const getDeviceId = () => {
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            deviceId = uuidv4();
            localStorage.setItem('deviceId', deviceId);
        }
        return deviceId;
    };

    // Email Login (Admin, Customer, etc.)
    const handleEmailLogin = async (values: { email: string; password: string }) => {
        setLoading(true);
        try {
            await login(values.email, values.password, getDeviceId());
            message.success('Вход выполнен успешно');

            // Получаем данные пользователя для редиректа
            const meResponse = await api.post('/auth/me');
            const userRole = meResponse.data.role;

            // Редирект по роли
            if (userRole === 'ADMIN') {
                router.push('/admin');
            } else if (['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER'].includes(userRole)) {
                router.push('/company');
            } else {
                router.push('/');
            }
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка входа');
        } finally {
            setLoading(false);
        }
    };

    // Google Login
    const handleGoogleSuccess = async (credentialResponse: any) => {
        setLoading(true);
        try {
            const response = await api.post('/auth/google', {
                token: credentialResponse.credential,
                deviceId: getDeviceId(),
            });
            const { accessToken, user } = response.data;
            setUser(user, accessToken);
            message.success('Вход через Google выполнен успешно');

            // Редирект по роли
            const userRole = user.role;
            if (userRole === 'ADMIN') {
                router.push('/admin');
            } else if (userRole === 'FORWARDER') {
                router.push('/forwarder');
            } else if (['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER'].includes(userRole)) {
                router.push('/company');
            } else {
                router.push('/');
            }
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка входа через Google');
        } finally {
            setLoading(false);
        }
    };

    // SMS Login Step 1 - Request Code
    const handleRequestSms = async (values: { phone: string }) => {
        setLoading(true);
        try {
            await api.post('/auth/sms/request', { phone: values.phone });
            setPhoneNumber(values.phone);
            setSmsStep('code');
            message.success('Код отправлен на указанный номер');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка отправки SMS');
        } finally {
            setLoading(false);
        }
    };

    // SMS Login Step 2 - Verify Code
    const handleVerifySms = async (values: { code: string }) => {
        setLoading(true);
        try {
            const response = await api.post('/auth/sms/verify', {
                phone: phoneNumber,
                code: values.code,
                deviceId: getDeviceId(),
            });
            setUser(response.data.user, response.data.accessToken);
            message.success('Вход выполнен успешно');
            router.push('/');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Неверный код');
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
                    <Title level={2} style={{ margin: 0, color: '#1677ff' }}>
                        LogiCore
                    </Title>
                    <Text type="secondary">Система управления логистикой</Text>
                </div>

                <Tabs
                    defaultActiveKey="email"
                    centered
                    items={[
                        {
                            key: 'email',
                            label: 'Email',
                            children: (
                                <>
                                    <Form layout="vertical" onFinish={handleEmailLogin}>
                                        <Form.Item
                                            name="email"
                                            rules={[
                                                { required: true, message: 'Введите email' },
                                                { type: 'email', message: 'Некорректный email' },
                                            ]}
                                        >
                                            <Input
                                                prefix={<UserOutlined />}
                                                placeholder="Email"
                                                size="large"
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            name="password"
                                            rules={[{ required: true, message: 'Введите пароль' }]}
                                        >
                                            <Input.Password
                                                prefix={<LockOutlined />}
                                                placeholder="Пароль"
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
                                                Войти
                                            </Button>
                                        </Form.Item>
                                    </Form>
                                    <Divider plain style={{ margin: '8px 0', fontSize: 13, color: '#999' }}>или</Divider>
                                    <div id="google-login-button" style={{ display: 'flex', justifyContent: 'center' }}>
                                        <Button
                                            block
                                            size="large"
                                            icon={<GoogleOutlined />}
                                            loading={loading}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                border: '1px solid #d9d9d9',
                                                background: '#fff',
                                                fontWeight: 500,
                                            }}
                                            onClick={() => {
                                                const google = (window as any).google;
                                                if (google?.accounts?.id) {
                                                    google.accounts.id.initialize({
                                                        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '5010908858-q66i33df9kjpij46u5sevjb1ftl9lo2d.apps.googleusercontent.com',
                                                        callback: handleGoogleSuccess,
                                                    });
                                                    google.accounts.id.prompt();
                                                } else {
                                                    message.error('Google SDK не загружен. Обновите страницу.');
                                                }
                                            }}
                                        >
                                            Войти через Google
                                        </Button>
                                    </div>
                                </>
                            ),
                        },
                        {
                            key: 'sms',
                            label: 'SMS (Водители)',
                            children: smsStep === 'phone' ? (
                                <Form layout="vertical" onFinish={handleRequestSms}>
                                    <Form.Item
                                        name="phone"
                                        rules={[{ required: true, message: 'Введите номер телефона' }]}
                                    >
                                        <Input
                                            prefix={<PhoneOutlined />}
                                            placeholder="+7 (___) ___-__-__"
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
                                            Получить код
                                        </Button>
                                    </Form.Item>
                                </Form>
                            ) : (
                                <Form layout="vertical" onFinish={handleVerifySms}>
                                    <Text style={{ display: 'block', marginBottom: 16, textAlign: 'center' }}>
                                        Код отправлен на {phoneNumber}
                                    </Text>
                                    <Form.Item
                                        name="code"
                                        rules={[{ required: true, message: 'Введите код из SMS' }]}
                                    >
                                        <Input
                                            placeholder="Код из SMS"
                                            size="large"
                                            maxLength={4}
                                            style={{ textAlign: 'center', letterSpacing: 8, fontSize: 24 }}
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
                                            Подтвердить
                                        </Button>
                                    </Form.Item>
                                    <Button type="link" block onClick={() => setSmsStep('phone')}>
                                        Изменить номер
                                    </Button>
                                </Form>
                            ),
                        },
                    ]}
                />

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <Text type="secondary">
                        Нет аккаунта?{' '}
                        <a onClick={() => router.push('/register')}>Зарегистрировать компанию</a>
                    </Text>
                </div>
            </Card>
            <div style={{ position: 'fixed', bottom: 10, right: 10, color: 'rgba(0,0,0,0.5)', fontSize: 12, background: 'yellow', padding: '4px 8px' }}>
                v0.2.1 BUILD: 2026-02-02 16:22
            </div>
        </InteractiveBackground>
    );
}
