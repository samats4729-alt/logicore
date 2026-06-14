'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, Typography, App, Divider } from 'antd';
import { UserOutlined, LockOutlined, GoogleOutlined } from '@ant-design/icons';
import { GoogleLogin } from '@react-oauth/google';
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
    const [hydrated, setHydrated] = useState(false);

    // Дожидаемся гидратации хранилища Zustand из localStorage
    useEffect(() => {
        setHydrated(useAuthStore.persist.hasHydrated());
        const unsub = useAuthStore.persist.onFinishHydration(() => {
            setHydrated(true);
        });
        return () => unsub();
    }, []);

    // Редирект авторизованного пользователя
    useEffect(() => {
        if (!hydrated) return;
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
            if (currentUser.role === 'ADMIN') {
                router.replace('/admin');
            } else if (['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER', 'FORWARDER', 'ACCOUNTANT', 'PARTNER'].includes(currentUser.role)) {
                router.replace('/company');
            } else {
                router.replace('/');
            }
        }
    }, [hydrated, router]);

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
            const user = meResponse.data;
            const userRole = user.role;

            // Редирект по роли
            if (userRole === 'ADMIN') {
                router.push('/admin');
            } else if (['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER', 'FORWARDER', 'ACCOUNTANT', 'PARTNER'].includes(userRole)) {
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

            // Если пользователь не найден — перекидываем на регистрацию
            if (response.data.needsRegistration) {
                sessionStorage.setItem('googleToken', credentialResponse.credential);
                sessionStorage.setItem('googleData', JSON.stringify(response.data.googleData));
                message.info('Аккаунт не найден. Завершите регистрацию.');
                router.push('/register?google=1');
                return;
            }

            const { accessToken, user } = response.data;
            setUser(user, accessToken);
            message.success('Вход через Google выполнен успешно');

            // Редирект по роли
            const userRole = user.role;
            if (userRole === 'ADMIN') {
                router.push('/admin');
            } else if (['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER', 'FORWARDER', 'ACCOUNTANT', 'PARTNER'].includes(userRole)) {
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Button
                                type="primary"
                                htmlType="submit"
                                size="large"
                                style={{ flex: 1, marginRight: 16 }}
                                loading={loading}
                            >
                                Войти
                            </Button>
                            <a onClick={() => router.push('/forgot-password')} style={{ fontSize: 13, color: '#1677ff' }}>
                                Забыли пароль?
                            </a>
                        </div>
                    </Form.Item>
                </Form>
                <Divider plain style={{ margin: '8px 0', fontSize: 13, color: '#999' }}>или</Divider>
                <div id="google-login-button" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => {
                            message.error('Ошибка входа через Google');
                        }}
                        theme="outline"
                        size="large"
                        width="370px"
                    />
                </div>

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
