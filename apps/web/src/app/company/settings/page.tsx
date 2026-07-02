'use client';

import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Upload, Image, Divider, Row, Col, Tabs, Modal, Select, Popconfirm } from 'antd';
import { LockOutlined, UserOutlined, PhoneOutlined, MailOutlined, UploadOutlined, BankOutlined, SafetyOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import CompanyFormFields from '@/components/CompanyFormFields';
import { prepareCompanyOptions } from '@/lib/company-helper';

const { Title, Text } = Typography;



export default function SettingsPage() {
    const { user, setUser } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [companyLoading, setCompanyLoading] = useState(false);
    const [stampLoading, setStampLoading] = useState(false);
    const [stampUrl, setStampUrl] = useState<string | null>(null);
    const [signatureLoading, setSignatureLoading] = useState(false);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();
    const [companyForm] = Form.useForm();

    const [myCompanies, setMyCompanies] = useState<any[]>([]);
    const [myCompaniesLoading, setMyCompaniesLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [addForm] = Form.useForm();
    const [submitLoading, setSubmitLoading] = useState(false);

    const loadCompanies = async () => {
        setMyCompaniesLoading(true);
        try {
            const res = await api.get('/company/my-companies');
            setMyCompanies(res.data || []);
        } catch (e) {
            console.error('Не удалось загрузить список организаций', e);
        } finally {
            setMyCompaniesLoading(false);
        }
    };

    const handleSwitchCompany = async (companyId: string) => {
        try {
            const res = await api.post(`/company/switch-company/${companyId}`);
            
            const authState = {
                state: {
                    user: res.data.user,
                    token: res.data.accessToken,
                    isAuthenticated: true,
                },
                version: 0,
            };
            localStorage.setItem('logcomp-auth', JSON.stringify(authState));
            setUser(res.data.user, res.data.accessToken);
            
            message.success('Организация успешно переключена');
            setTimeout(() => {
                window.location.reload();
            }, 100);
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка переключения организации');
        }
    };

    const handleAddCompany = async (values: any) => {
        setSubmitLoading(true);
        try {
            await api.post('/company/my-companies', {
                companyName: values.companyName,
                bin: values.bin,
            });
            message.success('Организация успешно добавлена');
            setModalVisible(false);
            addForm.resetFields();
            loadCompanies();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка добавления организации');
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDeleteCompany = async (companyId: string) => {
        setSubmitLoading(true);
        try {
            const res = await api.delete(`/company/my-companies/${companyId}`);
            message.success('Организация успешно удалена');
            
            if (res.data.switched) {
                // Если переключилась активная организация, обновляем JWT
                const authState = {
                    state: {
                        user: res.data.user,
                        token: res.data.accessToken,
                        isAuthenticated: true,
                    },
                    version: 0,
                };
                localStorage.setItem('logcomp-auth', JSON.stringify(authState));
                setUser(res.data.user, res.data.accessToken);
                
                setTimeout(() => {
                    window.location.reload();
                }, 100);
            } else {
                loadCompanies();
            }
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка удаления организации');
        } finally {
            setSubmitLoading(false);
        }
    };

    useEffect(() => {
        loadCompanyProfile();
        loadStamp();
        loadSignature();
        loadCompanies();
    }, []);

    const loadCompanyProfile = async () => {
        try {
            const response = await api.get('/company/profile');
            const company = response.data;
            companyForm.setFieldsValue({
                name: company.name,
                bin: company.bin,
                address: company.address,
                actualAddress: company.actualAddress,
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

    const loadSignature = async () => {
        try {
            const response = await api.get('/company/signature', { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            setSignatureUrl(url);
        } catch (error) {
            // Подпись не загружена
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

    const handleSignatureUpload = async (file: File) => {
        setSignatureLoading(true);
        try {
            const formData = new FormData();
            formData.append('signature', file);
            await api.post('/company/signature', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            message.success('Подпись загружена');
            loadSignature();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка загрузки подписи');
        } finally {
            setSignatureLoading(false);
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
                <span><UserOutlined style={{ marginRight: 6 }} />Профиль</span>
            ),
            children: (
                <div className="lc-card lc-pad" style={{ maxWidth: 860 }}>
                    <div className="lc-sec-title">Личные данные</div>
                    <div className="lc-sec-hint">Имя и контакты, которые видят коллеги и контрагенты</div>
                    <Form
                        form={profileForm}
                        layout="vertical"
                        onFinish={handleProfileUpdate}
                        style={{ marginTop: 18 }}
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
                        <Form.Item style={{ marginBottom: 0 }}>
                            <Button type="primary" htmlType="submit" loading={loading} className="lc-cta">
                                Сохранить изменения
                            </Button>
                        </Form.Item>
                    </Form>
                </div>
            ),
        },
        ...(user?.role === 'COMPANY_ADMIN' || user?.role === 'FORWARDER' ? [{
            key: 'company',
            label: (
                <span><BankOutlined style={{ marginRight: 6 }} />Данные компании</span>
            ),
            children: (
                <div className="lc-stack">
                    {/* Организации */}
                    <div className="lc-card lc-pad">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                                <div className="lc-sec-title">Организации</div>
                                <div className="lc-sec-hint">Переключение между вашими компаниями и добавление новых</div>
                            </div>
                            <Button icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                                Добавить организацию
                            </Button>
                        </div>
                        <div style={{ marginTop: 16 }}>
                            {prepareCompanyOptions(myCompanies, user?.companyId, user?.company?.name).length > 1 ? (
                                <Space align="center" size="middle" wrap>
                                    <Select
                                        style={{ width: 300 }}
                                        size="large"
                                        value={user?.companyId}
                                        onChange={handleSwitchCompany}
                                        optionLabelProp="label"
                                        options={prepareCompanyOptions(myCompanies, user?.companyId, user?.company?.name)}
                                        loading={myCompaniesLoading}
                                    />
                                    <Popconfirm
                                        title="Удалить организацию?"
                                        description="Вы действительно хотите удалить эту организацию? Доступ к её данным для вас будет закрыт."
                                        okText="Да, удалить"
                                        cancelText="Отмена"
                                        onConfirm={() => user?.companyId && handleDeleteCompany(user.companyId)}
                                        okButtonProps={{ danger: true, loading: submitLoading }}
                                    >
                                        <Button danger icon={<DeleteOutlined />} size="large" />
                                    </Popconfirm>
                                </Space>
                            ) : (
                                <Text strong style={{ fontSize: 15 }}>{user?.company?.name || 'Ваша организация'}</Text>
                            )}
                        </div>
                    </div>

                    <Form
                        form={companyForm}
                        layout="vertical"
                        onFinish={handleCompanyUpdate}
                        onValuesChange={async (changedValues) => {
                            if (changedValues.bin && /^\d{12}$/.test(changedValues.bin)) {
                                try {
                                    const res = await api.get(`/auth/company-lookup/${changedValues.bin}`);
                                    if (res.data) {
                                        const updateObj: any = {};
                                        if (res.data.name) updateObj.name = res.data.name;
                                        if (res.data.address) {
                                            updateObj.address = res.data.address;
                                            updateObj.actualAddress = res.data.address;
                                        }
                                        if (res.data.directorName) updateObj.directorName = res.data.directorName;
                                        if (res.data.phone) updateObj.phone = res.data.phone;
                                        if (res.data.email) updateObj.email = res.data.email;
                                        
                                        companyForm.setFieldsValue(updateObj);
                                        message.success('Реквизиты компании подтянуты');
                                    }
                                } catch (e) {
                                    // Ignore
                                }
                            }
                        }}
                    >
                        <div className="lc-card lc-pad">
                        <div className="lc-sec-title">Основная информация</div>
                        <div className="lc-sec-hint" style={{ marginBottom: 18 }}>Реквизиты подтягиваются автоматически по БИН</div>
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
                                    rules={[
                                        { required: true, message: 'Введите БИН' },
                                        { pattern: /^\d+$/, message: 'Только цифры' },
                                    ]}
                                >
                                    <Input size="large" placeholder="123456789012" maxLength={12} 
                                        onKeyPress={(e) => { if (!/\d/.test(e.key)) e.preventDefault(); }} 
                                    />
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
                                <Form.Item 
                                    name="actualAddress" 
                                    label="Фактический адрес"
                                    rules={[{ required: true, message: 'Введите фактический адрес' }]}
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
                        </div>

                        <div className="lc-card lc-pad" style={{ marginTop: 16 }}>
                        <div className="lc-sec-title"><BankOutlined style={{ marginRight: 8 }} />Банковские реквизиты</div>
                        <div className="lc-sec-hint" style={{ marginBottom: 18 }}>Используются в счетах и договорах</div>
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
                        </div>

                        <Form.Item style={{ margin: '16px 0 0' }}>
                            <Button type="primary" htmlType="submit" loading={companyLoading} className="lc-cta">
                                Сохранить данные компании
                            </Button>
                        </Form.Item>
                    </Form>

                    {/* Печать и подпись */}
                    <div className="lc-card lc-pad">
                        <div className="lc-sec-title">Печать и подпись</div>
                        <div className="lc-sec-hint" style={{ marginBottom: 18 }}>Подставляются в доверенности, счета и договоры. PNG с прозрачным фоном, до 5 МБ</div>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={12}>
                                <div className="lc-upload-tile">
                                    <div className="lc-upload-preview">
                                        {stampUrl
                                            ? <Image src={stampUrl} alt="Печать" width={120} />
                                            : <span className="lc-upload-empty"><UploadOutlined /> Печать не загружена</span>}
                                    </div>
                                    <Upload
                                        accept=".png,.jpg,.jpeg"
                                        showUploadList={false}
                                        beforeUpload={handleStampUpload}
                                    >
                                        <Button icon={<UploadOutlined />} loading={stampLoading}>
                                            {stampUrl ? 'Заменить печать' : 'Загрузить печать'}
                                        </Button>
                                    </Upload>
                                </div>
                            </Col>
                            <Col xs={24} md={12}>
                                <div className="lc-upload-tile">
                                    <div className="lc-upload-preview">
                                        {signatureUrl
                                            ? <Image src={signatureUrl} alt="Подпись" width={120} />
                                            : <span className="lc-upload-empty"><UploadOutlined /> Подпись не загружена</span>}
                                    </div>
                                    <Upload
                                        accept=".png,.jpg,.jpeg"
                                        showUploadList={false}
                                        beforeUpload={handleSignatureUpload}
                                    >
                                        <Button icon={<UploadOutlined />} loading={signatureLoading}>
                                            {signatureUrl ? 'Заменить подпись' : 'Загрузить подпись'}
                                        </Button>
                                    </Upload>
                                </div>
                            </Col>
                        </Row>
                    </div>
                    <Modal
                        title="Добавить организацию"
                        open={modalVisible}
                        onCancel={() => {
                            setModalVisible(false);
                            addForm.resetFields();
                        }}
                        footer={[
                            <Button key="cancel" onClick={() => setModalVisible(false)}>
                                Отмена
                            </Button>,
                            <Button key="submit" type="primary" loading={submitLoading} onClick={() => addForm.submit()}>
                                Добавить
                            </Button>
                        ]}
                        destroyOnClose
                    >
                        <div style={{ padding: '16px 0' }}>
                            <Form form={addForm} layout="vertical" onFinish={handleAddCompany}>
                                <CompanyFormFields form={addForm} />
                            </Form>
                        </div>
                    </Modal>
                </div>
            ),
        }] : []),
        {
            key: 'password',
            label: (
                <span><SafetyOutlined style={{ marginRight: 6 }} />Изменить пароль</span>
            ),
            children: (
                <div className="lc-card lc-pad" style={{ maxWidth: 560 }}>
                    <div className="lc-sec-title"><LockOutlined style={{ marginRight: 8 }} />Смена пароля</div>
                    <div className="lc-sec-hint" style={{ marginBottom: 18 }}>Минимум 6 символов. После смены текущая сессия сохранится</div>
                    <Form
                        form={passwordForm}
                        layout="vertical"
                        onFinish={handlePasswordChange}
                    >
                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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

                            <Form.Item style={{ marginBottom: 0 }}>
                                <Button type="primary" htmlType="submit" loading={passwordLoading} className="lc-cta">
                                    Изменить пароль
                                </Button>
                            </Form.Item>
                        </Space>
                    </Form>
                </div>
            ),
        },
    ];

    return (
        <div className="lc-page">
            <div style={{ marginBottom: 18 }}>
                <div className="lc-eyebrow">LogiCore — аккаунт</div>
                <h1 className="lc-title">Настройки</h1>
                <p style={{ color: '#8a91a0', fontSize: 14, margin: '6px 0 0' }}>
                    Профиль, данные организации и безопасность
                </p>
            </div>
            <Tabs
                defaultActiveKey="profile"
                items={tabItems}
                tabPosition="top"
                style={{ minHeight: 400 }}
            />
        </div>
    );
}
