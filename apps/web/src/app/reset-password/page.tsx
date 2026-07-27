'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Form, Input, Button } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import AuthShell from '@/components/AuthShell';
import { toast } from 'sonner';

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    
    const token = searchParams.get('token');

    useEffect(() => {
        if (!token) {
            toast.error('Неверная ссылка для восстановления пароля');
            router.push('/login');
        }
    }, [token, router]);

    const handleFinish = async (values: any) => {
        if (!token) return;
        
        setLoading(true);
        try {
            await api.post('/auth/reset-password', { 
                token, 
                newPassword: values.password 
            });
            setIsSuccess(true);
            toast.success('Пароль успешно изменен');
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка сброса пароля. Возможно ссылка устарела.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) return null;

    return (
        <>
            <div className="lc-auth-card-head">
                <div className="lc-auth-card-title">Новый пароль</div>
                <div className="lc-auth-card-sub">
                    {isSuccess
                        ? 'Пароль успешно обновлён'
                        : 'Придумайте новый надежный пароль'
                    }
                </div>
            </div>

            {!isSuccess ? (
                <Form layout="vertical" onFinish={handleFinish}>
                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: 'Введите новый пароль' },
                            { min: 8, message: 'Пароль должен содержать минимум 8 символов' }
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
        </>
    );
}

export default function ResetPasswordPage() {
    return (
        <AuthShell
            eyebrow="(03 — Восстановление)"
            title={<>Вернём <em>доступ</em>.</>}
            subtitle="Задайте новый пароль — и продолжайте работу в своём кабинете."
        >
            <Suspense fallback={<div>Загрузка...</div>}>
                <ResetPasswordForm />
            </Suspense>
        </AuthShell>
    );
}
