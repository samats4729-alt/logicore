'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, message, Typography, Row, Col, Space, Divider } from 'antd';
import { UserOutlined, PhoneOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const { Title, Text } = Typography;

function InviteForm() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const router = useRouter();
    const { setUser } = useAuthStore();
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [invitationInfo, setInvitationInfo] = useState<{ email: string; role: string; companyName: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setError('Ссылка недействительна (отсутствует токен)');
            setLoading(false);
            return;
        }

        api.get(`/auth/invitation/${token}`)
            .then(res => {
                setInvitationInfo(res.data);
            })
            .catch(err => {
                setError(err.response?.data?.message || 'Приглашение недействительно или просрочено');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [token]);

    const handleRegister = async (values: any) => {
        try {
            setSubmitting(true);
            const { confirmPassword, ...data } = values;
            
            const res = await api.post('/auth/register/invited', {
                ...data,
                token
            });
            
            setUser(res.data.user, res.data.accessToken);
            
            message.success('Регистрация успешна!');
            
            // Redirect based on role and company type
            const user = res.data.user;
            if (user.role === 'DRIVER') {
                router.push('/driver');
            } else if (['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER', 'FORWARDER'].includes(user.role)) {
                if (user.company?.type === 'FORWARDER') {
                    router.push('/forwarder');
                } else {
                    router.push('/company');
                }
            } else {
                router.push(`/${user.role.toLowerCase()}`);
            }
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка регистрации');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <Card style={{ width: 400, margin: '100px auto', textAlign: 'center' }}>Загрузка...</Card>;
    }

    if (error) {
        return (
            <Card style={{ width: 400, margin: '100px auto', textAlign: 'center' }}>
                <Title level={4} type="danger">Ошибка</Title>
                <Text>{error}</Text>
                <div style={{ marginTop: 24 }}>
                    <Button type="primary" onClick={() => router.push('/login')}>На главную</Button>
                </div>
            </Card>
        );
    }

    return (
        <Card style={{ width: 450, margin: '60px auto', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <Title level={3}>Регистрация сотрудника</Title>
                <Text>Вы приглашены в компанию <strong style={{ color: '#1677ff' }}>{invitationInfo?.companyName}</strong></Text>
            </div>
            
            <Form layout="vertical" onFinish={handleRegister} size="large">
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item name="firstName" rules={[{ required: true, message: 'Введите имя' }]}>
                            <Input prefix={<UserOutlined />} placeholder="Имя" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="lastName" rules={[{ required: true, message: 'Введите фамилию' }]}>
                            <Input placeholder="Фамилия" />
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item name="phone" rules={[{ required: true, message: 'Введите телефон' }]}>
                    <Input prefix={<PhoneOutlined />} placeholder="+77001234567" />
                </Form.Item>

                <Form.Item name="password" rules={[{ required: true, min: 6, message: 'Минимум 6 символов' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="Придумайте пароль" />
                </Form.Item>

                <Form.Item 
                    name="confirmPassword" 
                    dependencies={['password']}
                    rules={[
                        { required: true, message: 'Подтвердите пароль' },
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
                    <Input.Password prefix={<SafetyOutlined />} placeholder="Повторите пароль" />
                </Form.Item>

                <Button type="primary" htmlType="submit" loading={submitting} block>
                    Завершить регистрацию
                </Button>
            </Form>
        </Card>
    );
}

export default function InvitePage() {
    return (
        <div style={{ minHeight: '100vh', padding: 20, background: '#f5f5f5' }}>
            <Suspense fallback={<div style={{ textAlign: 'center', marginTop: 100 }}>Загрузка...</div>}>
                <InviteForm />
            </Suspense>
        </div>
    );
}
