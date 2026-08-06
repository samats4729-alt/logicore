'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Form, Input, Button, Typography, Steps, Result, Divider, Spin, Checkbox } from 'antd';
import { UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { GoogleLogin } from '@react-oauth/google';
import AuthShell from '@/components/AuthShell';
import { toast } from 'sonner';

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
                // Поле почты называется `email`. Пока сюда писали `adminEmail`,
                // почта из Google не подставлялась никуда: человек видел пустое
                // поле и вводил её заново — с опечаткой это уже другой аккаунт.
                form.setFieldsValue({
                    email: data.email,
                    firstName: data.firstName,
                    lastName: data.lastName,
                });
                toast.info('Почта взята из Google. Добавьте телефон и пароль');
            }
        }
    }, [searchParams]);

    const handleGoogleRegisterSuccess = async (credentialResponse: any) => {
        if (!form.getFieldValue('agreement')) {
            toast.warning('Сначала примите условия Публичной оферты и Политики конфиденциальности');
            return;
        }
        // Проверяем что телефон заполнен
        const phone = form.getFieldValue('phone');
        if (!phone) {
            toast.warning('Сначала укажите номер телефона');
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

            setUser(res.data.admin);
            setStep(2);

            setTimeout(() => {
                router.push('/company');
            }, 2000);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка регистрации через Google');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (values: any) => {
        setLoading(true);
        try {
            // agreement — только для формы (галочка согласия), бэкенд это поле не принимает
            const { agreement, ...payload } = values;
            // Регистрируется человек, а не компания: организация создаётся
            // отдельно и проходит проверку документов.
            const response = await api.post('/auth/register', payload);

            setUser(response.data.user);
            setStep(1);

            setTimeout(() => {
                router.push('/company/onboarding');
            }, 1500);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка регистрации');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            eyebrow="(02 — Регистрация)"
            title={<>Начните управлять <em>перевозками</em>.</>}
            subtitle="Сначала личный профиль, затем организация. Работа откроется после проверки документов."
            points={[
                'Заявки и назначение водителей',
                'Свои контрагенты и тарифы',
                'Команда с настраиваемыми правами',
            ]}
            cardWidth={560}
        >
                <div className="lc-auth-card-head">
                    <div className="lc-auth-card-title">Регистрация</div>
                    <div className="lc-auth-card-sub">Создайте личный профиль</div>
                </div>

                <Steps
                    current={step}
                    style={{ marginBottom: 32 }}
                    size="small"
                    items={[
                        { title: 'Профиль', icon: <UserOutlined /> },
                        { title: 'Готово', icon: <CheckCircleOutlined /> },
                    ]}
                />

                {step === 1 ? (
                    <Result
                        status="success"
                        title="Профиль создан"
                        subTitle="Теперь создайте организацию — переходим к следующему шагу…"
                    />
                ) : (
                    <Form 
                        form={form} 
                        layout="vertical" 
                        onFinish={handleRegister} 
                        preserve={true}
                    >
                        <div style={{ display: step === 0 ? 'block' : 'none' }}>
                            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                                Сначала — ваши данные. Организацию создадите следующим шагом,
                                она начнёт работать после проверки документов.
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
                                name="email"
                                label="Email"
                                rules={[{ required: true, type: 'email' }]}
                                // Почта из Google менять нельзя: аккаунт заводится
                                // именно на неё, и правка развела бы вход через
                                // Google и профиль в платформе на разные адреса.
                                extra={googleToken ? 'Почта из вашего аккаунта Google, изменить нельзя' : undefined}
                            >
                                <Input size="large" disabled={!!googleToken} />
                            </Form.Item>
                            <Form.Item
                                name="phone"
                                label="Телефон"
                                rules={[
                                    { required: true },
                                    {
                                        // Длина не ограничивалась ничем: в поле
                                        // помещался номер любой длины, и такой
                                        // «телефон» уходил в базу как есть.
                                        validator: (_, value) => {
                                            if (!value) return Promise.resolve();
                                            const digits = String(value).replace(/\D/g, '');
                                            return digits.length === 11
                                                ? Promise.resolve()
                                                : Promise.reject(new Error('Номер из 11 цифр: +7 и десять цифр'));
                                        },
                                    },
                                ]}
                            >
                                <Input placeholder="+77001234567" size="large" maxLength={12} />
                            </Form.Item>
                            <Form.Item
                                name="password"
                                label="Пароль"
                                rules={[{ required: true, min: 8, message: 'Минимум 8 символов' }]}
                            >
                                <Input.Password size="large" />
                            </Form.Item>
                            <Form.Item
                                name="agreement"
                                valuePropName="checked"
                                rules={[{
                                    validator: (_, value) => value
                                        ? Promise.resolve()
                                        : Promise.reject(new Error('Для регистрации необходимо принять условия')),
                                }]}
                                style={{ marginBottom: 14 }}
                            >
                                <Checkbox style={{ fontSize: 13 }}>
                                    Я принимаю условия{' '}
                                    <a href="/terms" target="_blank" rel="noopener noreferrer">Публичной оферты</a>{' '}
                                    и{' '}
                                    <a href="/privacy" target="_blank" rel="noopener noreferrer">Политики конфиденциальности</a>
                                </Checkbox>
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
                                        toast.error('Ошибка входа через Google');
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
