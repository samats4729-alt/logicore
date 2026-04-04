'use client';

import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Upload, Image, Divider, Row, Col, Tabs } from 'antd';
import { LockOutlined, UserOutlined, PhoneOutlined, MailOutlined, UploadOutlined, BankOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

export default function SettingsPage() {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [companyLoading, setCompanyLoading] = useState(false);
    const [stampLoading, setStampLoading] = useState(false);
    const [stampUrl, setStampUrl] = useState<string | null>(null);
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();
    const [companyForm] = Form.useForm();

    useEffect(() => {
        loadCompanyProfile();
        loadStamp();
    }, []);

    const loadCompanyProfile = async () => {
        try {
            const response = await api.get('/company/profile');
            const company = response.data;
            companyForm.setFieldsValue({
                name: company.name,
                bin: company.bin,
                address: company.address,
                phone: company.phone,
                email: company.email,
                directorName: company.directorName,
                bankAccount: company.bankAccount,
                bankName: company.bankName,
                bankBic: company.bankBic,
                kbe: company.kbe,
            });
        } catch (error) {
            console.error('Ошибка загрузки профиля компании:', error);
        }
    };

    const loadStamp = async () => {
        try {
            const response = await api.get('/company/stamp', { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            setStampUrl(url);
        } catch (error) {
            // Печать не загружена
        }
    };

    const handleProfileUpdate = async (values: any) => {
        setLoading(true);
        try {
            await api.put('/users/profile', values);
            message.success('Профиль обновлён');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка обновления профиля');
        } finally {
            setLoading(false);
        }
    };

    const handleCompanyUpdate = async (values: any) => {
        setCompanyLoading(true);
        try {
            await api.put('/company/profile', values);
            message.success('Данные компании обновлены');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка обновления данных компании');
        } finally {
            setCompanyLoading(false);
        }
    };

    const handleStampUpload = async (file: File) => {
        setStampLoading(true);
        try {
            const formData = new FormData();
            formData.append('stamp', file);
            await api.post('/company/stamp', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            message.success('Печать загружена');
            loadStamp();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка загрузки печати');
        } finally {
            setStampLoading(false);
        }
        return false;
    };

    const handlePasswordChange = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error('Пароли не совпадают');
            return;
        }

        setPasswordLoading(true);
        try {
            await api.put('/users/password', {
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            });
            message.success('Пароль успешно изменён');
            passwordForm.resetFields();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка изменения пароля');
        } finally {
            setPasswordLoading(false);
        }
    };

    const tabItems = [
        {
            key: 'profile',
            label: (
                <span><UserOutlined style={{ marginRight: 6 }} />Настройки профиля</span>
            ),
            children: (
                <Card bordered={false}>
                    <Form
                        form={profileForm}
                        layout="vertical"
                        onFinish={handleProfileUpdate}
                        initialValues={{
                            firstName: user?.firstName,
                            lastName: user?.lastName,
                            email: user?.email,
                            phone: user?.phone,
                        }}
                    >
                        <Row gutter={24}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="firstName"
                                    label="Имя"
                                    rules={[{ required: true, message: 'Введите имя' }]}
                                >
                                    <Input prefix={<UserOutlined />} size="large" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="lastName"
                                    label="Фамилия"
                                    rules={[{ required: true, message: 'Введите фамилию' }]}
                                >
                                    <Input prefix={<UserOutlined />} size="large" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="email"
                                    label="Email"
                                    rules={[{ type: 'email', message: 'Неверный формат email' }]}
                                >
                                    <Input prefix={<MailOutlined />} size="large" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="phone" label="Телефон">
                                    <Input prefix={<PhoneOutlined />} size="large" disabled />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={loading} size="large">
                                Сохранить изменения
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            ),
        },
        ...(user?.role === 'COMPANY_ADMIN' ? [{
            key: 'company',
            label: (
                <span><BankOutlined style={{ marginRight: 6 }} />Данные компании</span>
            ),
            children: (
                <Card bordered={false}>
                    <Form
                        form={companyForm}
                        layout="vertical"
                        onFinish={handleCompanyUpdate}
                    >
                        <Title level={5} style={{ marginBottom: 16 }}>Основная информация</Title>
                        <Row gutter={24}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="name"
                                    label="Название компании"
                                    rules={[{ required: true, message: 'Введите название' }]}
                                >
                                    <Input size="large" placeholder="ТОО КазЛогистик" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="bin"
                                    label="БИН"
                                    rules={[{ required: true, message: 'Введите БИН' }]}
                                >
                                    <Input size="large" placeholder="123456789012" maxLength={12} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    name="address" 
                                    label="Юридический адрес"
                                    rules={[{ required: true, message: 'Введите юридический адрес' }]}
                                >
                                    <Input size="large" placeholder="г. Алматы, ул. ..." />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="phone" label="Телефон компании">
                                    <Input size="large" placeholder="+77001234567" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="email" label="Email компании">
                                    <Input size="large" placeholder="info@company.kz" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    name="directorName" 
                                    label="ФИО директора"
                                    rules={[{ required: true, message: 'Введите ФИО директора' }]}
                                >
                                    <Input size="large" placeholder="Иванов И.И." />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Divider />
                        <Title level={5} style={{ marginBottom: 16 }}>
                            <BankOutlined style={{ marginRight: 8 }} />
                            Банковские реквизиты
                        </Title>
                        <Row gutter={24}>
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    name="bankAccount" 
                                    label="ИИК (номер счёта)"
                                    rules={[{ required: true, message: 'Введите ИИК' }]}
                                >
                                    <Input size="large" placeholder="KZ12345678901234567" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    name="bankName" 
                                    label="Название банка"
                                    rules={[{ required: true, message: 'Введите название банка' }]}
                                >
                                    <Input size="large" placeholder="АО «Каспи Банк»" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    name="bankBic" 
                                    label="БИК"
                                    rules={[{ required: true, message: 'Введите БИК' }]}
                                >
                                    <Input size="large" placeholder="CASPKZKA" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    name="kbe" 
                                    label="КБЕ"
                                    rules={[{ required: true, message: 'Введите КБЕ' }]}
                                >
                                    <Input size="large" placeholder="17" maxLength={2} />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={companyLoading} size="large">
                                Сохранить данные компании
                            </Button>
                        </Form.Item>
                    </Form>

                    <Divider />
                    <Title level={5} style={{ marginBottom: 16 }}>Печать компании</Title>
                    <Space direction="vertical" size="middle">
                        {stampUrl && (
                            <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, padding: 16, display: 'inline-block' }}>
                                <Image src={stampUrl} alt="Печать" width={150} />
                            </div>
                        )}
                        <Upload
                            accept=".png,.jpg,.jpeg"
                            showUploadList={false}
                            beforeUpload={handleStampUpload}
                        >
                            <Button icon={<UploadOutlined />} loading={stampLoading} size="large">
                                {stampUrl ? 'Заменить печать' : 'Загрузить печать (PNG)'}
                            </Button>
                        </Upload>
                        <Text type="secondary">Рекомендуется PNG с прозрачным фоном, размер не более 5 МБ</Text>
                    </Space>
                </Card>
            ),
        }] : []),
        {
            key: 'password',
            label: (
                <span><SafetyOutlined style={{ marginRight: 6 }} />Изменить пароль</span>
            ),
            children: (
                <Card bordered={false}>
                    <Form
                        form={passwordForm}
                        layout="vertical"
                        onFinish={handlePasswordChange}
                    >
                        <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 600 }}>
                            <Form.Item
                                name="currentPassword"
                                label="Текущий пароль"
                                rules={[{ required: true, message: 'Введите текущий пароль' }]}
                            >
                                <Input.Password prefix={<LockOutlined />} size="large" />
                            </Form.Item>

                            <Form.Item
                                name="newPassword"
                                label="Новый пароль"
                                rules={[
                                    { required: true, message: 'Введите новый пароль' },
                                    { min: 6, message: 'Минимум 6 символов' },
                                ]}
                            >
                                <Input.Password prefix={<LockOutlined />} size="large" />
                            </Form.Item>

                            <Form.Item
                                name="confirmPassword"
                                label="Подтвердите новый пароль"
                                rules={[{ required: true, message: 'Подтвердите пароль' }]}
                            >
                                <Input.Password prefix={<LockOutlined />} size="large" />
                            </Form.Item>

                            <Form.Item>
                                <Button type="primary" htmlType="submit" loading={passwordLoading} size="large">
                                    Изменить пароль
                                </Button>
                            </Form.Item>
                        </Space>
                    </Form>
                </Card>
            ),
        },
    ];

    return (
        <div>
            <Title level={3} style={{ marginBottom: 20 }}>Настройки</Title>
            <Tabs
                defaultActiveKey="profile"
                items={tabItems}
                tabPosition="top"
                size="large"
                style={{ minHeight: 400 }}
            />
        </div>
    );
}
