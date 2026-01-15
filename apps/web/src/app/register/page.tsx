'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Form, Input, Button, Typography, message, Steps, Result, Radio, Space } from 'antd';
import { UserOutlined, BankOutlined, CheckCircleOutlined, ShopOutlined, TruckOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import InteractiveBackground from '@/components/ui/InteractiveBackground';

const { Title, Text, Paragraph } = Typography;

export default function RegisterCompanyPage() {
    const router = useRouter();
    const { setUser } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(0);
    const [companyType, setCompanyType] = useState<'CUSTOMER' | 'FORWARDER' | null>(null);
    const [form] = Form.useForm();

    const handleRegister = async (values: any) => {
        setLoading(true);
        try {
            const response = await api.post('/auth/register-company', {
                ...values,
                companyType,
            });

            // Сохраняем токен
            localStorage.setItem('token', response.data.accessToken);
            setUser(response.data.admin, response.data.accessToken);

            setStep(3);

            // Через 2 секунды редирект
            setTimeout(() => {
                if (companyType === 'FORWARDER') {
                    router.push('/forwarder');
                } else {
                    router.push('/company');
                }
            }, 2000);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка регистрации');
        } finally {
            setLoading(false);
        }
    };

    return (
        <InteractiveBackground>
            <Card
                style={{
                    width: 520,
                    borderRadius: 12,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <Title level={3}>Регистрация компании</Title>
                    <Text type="secondary">Создайте аккаунт для вашей компании</Text>
                </div>

                <Steps
                    current={step}
                    style={{ marginBottom: 32 }}
                    size="small"
                    items={[
                        { title: 'Компания', icon: <BankOutlined /> },
                        { title: 'Тип', icon: <TruckOutlined /> },
                        { title: 'Админ', icon: <UserOutlined /> },
                        { title: 'Готово', icon: <CheckCircleOutlined /> },
                    ]}
                />

                {step === 3 ? (
                    <Result
                        status="success"
                        title="Компания зарегистрирована!"
                        subTitle="Перенаправляем в личный кабинет..."
                    />
                ) : (
                    <Form form={form} layout="vertical" onFinish={handleRegister} preserve={true}>
                        {/* Шаг 0: Данные компании */}
                        <div style={{ display: step === 0 ? 'block' : 'none' }}>
                            <Form.Item
                                name="companyName"
                                label="Название компании"
                                rules={[{ required: true, message: 'Введите название' }]}
                            >
                                <Input placeholder="ТОО КазЛогистик" size="large" />
                            </Form.Item>
                            <Form.Item name="bin" label="БИН (необязательно)">
                                <Input placeholder="123456789012" size="large" />
                            </Form.Item>
                            <Button type="primary" block size="large" onClick={() => {
                                form.validateFields(['companyName']).then(() => setStep(1));
                            }}>
                                Далее
                            </Button>
                        </div>

                        {/* Шаг 1: Выбор типа аккаунта */}
                        <div style={{ display: step === 1 ? 'block' : 'none' }}>
                            <Paragraph type="secondary" style={{ marginBottom: 16, textAlign: 'center' }}>
                                Выберите тип вашей компании
                            </Paragraph>
                            <Radio.Group
                                value={companyType}
                                onChange={(e) => setCompanyType(e.target.value)}
                                style={{ width: '100%' }}
                            >
                                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                    <Radio.Button
                                        value="CUSTOMER"
                                        style={{
                                            width: '100%',
                                            height: 'auto',
                                            padding: '16px 20px',
                                            borderRadius: 8,
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <ShopOutlined style={{ fontSize: 28, color: '#1677ff' }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 16 }}>Я Заказчик</div>
                                                <div style={{ fontSize: 13, color: '#666', fontWeight: 400 }}>
                                                    Создаю заявки на перевозку грузов
                                                </div>
                                            </div>
                                        </div>
                                    </Radio.Button>
                                    <Radio.Button
                                        value="FORWARDER"
                                        style={{
                                            width: '100%',
                                            height: 'auto',
                                            padding: '16px 20px',
                                            borderRadius: 8,
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <TruckOutlined style={{ fontSize: 28, color: '#52c41a' }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 16 }}>Я Экспедитор</div>
                                                <div style={{ fontSize: 13, color: '#666', fontWeight: 400 }}>
                                                    Выполняю перевозки, назначаю водителей
                                                </div>
                                            </div>
                                        </div>
                                    </Radio.Button>
                                </Space>
                            </Radio.Group>
                            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                                <Button size="large" onClick={() => setStep(0)} style={{ flex: 1 }}>
                                    Назад
                                </Button>
                                <Button
                                    type="primary"
                                    size="large"
                                    style={{ flex: 2 }}
                                    disabled={!companyType}
                                    onClick={() => setStep(2)}
                                >
                                    Далее
                                </Button>
                            </div>
                        </div>

                        {/* Шаг 2: Данные администратора */}
                        <div style={{ display: step === 2 ? 'block' : 'none' }}>
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
                                <Button size="large" onClick={() => setStep(1)} style={{ flex: 1 }}>
                                    Назад
                                </Button>
                                <Button type="primary" htmlType="submit" loading={loading} size="large" style={{ flex: 2 }}>
                                    Зарегистрировать
                                </Button>
                            </div>
                        </div>
                    </Form>
                )}

                {step < 3 && (
                    <div style={{ textAlign: 'center', marginTop: 24 }}>
                        <Text type="secondary">
                            Уже есть аккаунт?{' '}
                            <a onClick={() => router.push('/login')}>Войти</a>
                        </Text>
                    </div>
                )}
            </Card>
        </InteractiveBackground>
    );
}
