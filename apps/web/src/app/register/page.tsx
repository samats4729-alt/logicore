'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Form, Input, Button, Typography, message, Steps, Result, Divider, Spin } from 'antd';
import { UserOutlined, BankOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { GoogleLogin } from '@react-oauth/google';
import AuthShell from '@/components/AuthShell';
import CompanyFormFields from '@/components/CompanyFormFields';

const { Text, Paragraph } = Typography;

function RegisterContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { setUser } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(0);
    const [form] = Form.useForm();
    const [googleToken, setGoogleToken] = useState<string | null>(null);

    // Если пришли с /login?google=1 — подхватываем данные Google
    useEffect(() => {
        if (searchParams.get('google') === '1') {
            const token = sessionStorage.getItem('googleToken');
            const dataStr = sessionStorage.getItem('googleData');
            if (token && dataStr) {
                setGoogleToken(token);
                const data = JSON.parse(dataStr);
                form.setFieldsValue({
                    adminEmail: data.email,
                    firstName: data.firstName,
                    lastName: data.lastName,
                });
                message.info('Заполните данные компании и телефон для завершения регистрации через Google');
            }
        }
    }, [searchParams]);

    const handleGoogleRegisterSuccess = async (credentialResponse: any) => {
        // Проверяем что телефон заполнен
        const phone = form.getFieldValue('phone');
        if (!phone) {
            message.warning('Сначала укажите номер телефона');
            return;
        }

        const token = credentialResponse.credential;
        setGoogleToken(token);
        setLoading(true);
        try {
            const formValues = form.getFieldsValue();
            const res = await api.post('/auth/google/register', {
                token,
                companyName: formValues.companyName,
                companyType: 'CUSTOMER',
                bin: formValues.bin,
                phone: formValues.phone || '+70000000000',
            });

            localStorage.setItem('token', res.data.accessToken);
            setUser(res.data.admin, res.data.accessToken);
            setStep(2);

            setTimeout(() => {
                router.push('/company');
            }, 2000);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка регистрации через Google');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (values: any) => {
        setLoading(true);
        try {
            const response = await api.post('/auth/register-company', {
                ...values,
                companyType: 'CUSTOMER',
            });

            // Сохраняем токен
            localStorage.setItem('token', response.data.accessToken);
            setUser(response.data.admin, response.data.accessToken);

            setStep(2);

            // Через 2 секунды редирект
            setTimeout(() => {
                router.push('/company');
            }, 2000);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка регистрации');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            eyebrow="(02 — Регистрация)"
            title={<>Начните управлять <em>перевозками</em>.</>}
            subtitle="Аккаунт компании создаётся за пару минут — сразу после регистрации откроется рабочий кабинет."
            points={[
                'Заявки и назначение водителей',
                'Свои контрагенты и тарифы',
                'Команда с настраиваемыми правами',
            ]}
            cardWidth={560}
        >
                <div className="lc-auth-card-head">
                    <div className="lc-auth-card-title">Регистрация компании</div>
                    <div className="lc-auth-card-sub">Создайте аккаунт для вашей компании</div>
                </div>

                <Steps
                    current={step}
                    style={{ marginBottom: 32 }}
                    size="small"
                    items={[
                        { title: 'Компания', icon: <BankOutlined /> },
                        { title: 'Админ', icon: <UserOutlined /> },
                        { title: 'Готово', icon: <CheckCircleOutlined /> },
                    ]}
                />

                {step === 2 ? (
                    <Result
                        status="success"
                        title="Компания зарегистрирована!"
                        subTitle="Перенаправляем в личный кабинет..."
                    />
                ) : (
                    <Form 
                        form={form} 
                        layout="vertical" 
                        onFinish={handleRegister} 
                        preserve={true}
                    >
                        {/* Шаг 0: Данные компании */}
                        <div style={{ display: step === 0 ? 'block' : 'none' }}>
                            <CompanyFormFields form={form} />
                            <Button type="primary" block size="large" onClick={() => {
                                form.validateFields(['companyName', 'bin']).then(() => setStep(1));
                            }}>
                                Далее
                            </Button>
                        </div>

                        {/* Шаг 1: Данные администратора */}
                        <div style={{ display: step === 1 ? 'block' : 'none' }}>
                            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                                Данные администратора компании
                            </Paragraph>
                            <Form.Item
                                name="firstName"
                                label="Имя"
                                rules={[{ required: true }]}
                            >
                                <Input size="large" />
                            </Form.Item>
                            <Form.Item
                                name="lastName"
                                label="Фамилия"
                                rules={[{ required: true }]}
                            >
                                <Input size="large" />
                            </Form.Item>
                            <Form.Item
                                name="adminEmail"
                                label="Email"
                                rules={[{ required: true, type: 'email' }]}
                            >
                                <Input size="large" />
                            </Form.Item>
                            <Form.Item
                                name="phone"
                                label="Телефон"
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="+77001234567" size="large" />
                            </Form.Item>
                            <Form.Item
                                name="adminPassword"
                                label="Пароль"
                                rules={[{ required: true, min: 6, message: 'Минимум 6 символов' }]}
                            >
                                <Input.Password size="large" />
                            </Form.Item>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <Button size="large" onClick={() => setStep(0)} style={{ flex: 1 }}>
                                    Назад
                                </Button>
                                <Button type="primary" htmlType="submit" loading={loading} size="large" style={{ flex: 2 }}>
                                    Зарегистрировать
                                </Button>
                            </div>
                            <Divider plain style={{ margin: '12px 0', fontSize: 13, color: '#999' }}>или</Divider>
                            <div id="google-register-button" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                <GoogleLogin
                                    onSuccess={handleGoogleRegisterSuccess}
                                    onError={() => {
                                        message.error('Ошибка входа через Google');
                                    }}
                                    theme="outline"
                                    size="large"
                                    width="470px"
                                />
                            </div>
                        </div>
                    </Form>
                )}

                {step < 2 && (
                    <div style={{ textAlign: 'center', marginTop: 24 }}>
                        <Text type="secondary">
                            Уже есть аккаунт?{' '}
                            <a onClick={() => router.push('/login')}>Войти</a>
                        </Text>
                    </div>
                )}
        </AuthShell>
    );
}

export default function RegisterCompanyPage() {
    return (
        <Suspense fallback={<Spin size="large" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }} />}>
            <RegisterContent />
        </Suspense>
    );
}
