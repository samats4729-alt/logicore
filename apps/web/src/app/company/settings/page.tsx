'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Form, Input, Button, message, Typography, Upload, Image, Row, Col, Tabs, Modal, Popconfirm, Tag } from 'antd';
import { UploadOutlined, BankOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import CompanyFormFields from '@/components/CompanyFormFields';

const { Text } = Typography;



export default function SettingsPage() {
    const { user, setUser } = useAuthStore();
    const searchParams = useSearchParams();
    // Под-вкладку можно задать ссылкой: /company/settings?sub=bank (orgs | main | bank | stamp)
    const rawSub = searchParams?.get('sub') || '';
    const initialSub = ['orgs', 'main', 'bank', 'stamp'].includes(rawSub) ? rawSub : 'orgs';
    const [companySubTab, setCompanySubTab] = useState(initialSub);
    const [companyLoading, setCompanyLoading] = useState(false);
    const [stampLoading, setStampLoading] = useState(false);
    const [stampUrl, setStampUrl] = useState<string | null>(null);
    const [signatureLoading, setSignatureLoading] = useState(false);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
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

    const tabItems = [
        ...(user?.role === 'COMPANY_ADMIN' || user?.role === 'FORWARDER' ? [{
            key: 'company',
            label: (
                <span><BankOutlined style={{ marginRight: 6 }} />Организация</span>
            ),
            children: (
                <div className="lc-stack">
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
                    <Tabs
                        activeKey={companySubTab}
                        onChange={setCompanySubTab}
                        tabPosition="top"
                        items={[
                            {
                                key: 'orgs',
                                label: 'Мои организации',
                                children: (
                                    <div className="lc-card lc-pad">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                                            <div>
                                                <div className="lc-sec-title">Мои организации</div>
                                                <div className="lc-sec-hint">Все ваши компании. Текущая — та, с данными которой вы сейчас работаете</div>
                                            </div>
                                            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                                                Добавить организацию
                                            </Button>
                                        </div>

                                        {myCompaniesLoading ? (
                                            <Text type="secondary">Загрузка…</Text>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {(myCompanies.length ? myCompanies : (user?.company ? [user.company] : [])).map((c: any) => {
                                                    const isCurrent = c.id === user?.companyId;
                                                    return (
                                                        <div
                                                            key={c.id}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                                                padding: '14px 16px', borderRadius: 14,
                                                                border: `1px solid ${isCurrent ? 'var(--lc-primary, #1677ff)' : 'var(--lc-border)'}`,
                                                                background: isCurrent ? 'rgba(22,119,255,0.05)' : 'transparent',
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                                                <span className="lc2-avatar lc2-avatar-sm" style={{ background: '#e0f2fe', color: '#0369a1', flexShrink: 0 }}>
                                                                    {(c.name || 'О').slice(0, 2).toUpperCase()}
                                                                </span>
                                                                <div style={{ minWidth: 0 }}>
                                                                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--lc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {c.name || 'Без названия'}
                                                                    </div>
                                                                    <div style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>
                                                                        {c.bin ? `БИН ${c.bin}` : 'реквизиты не заполнены'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                                                {isCurrent
                                                                    ? <Tag color="blue" style={{ margin: 0 }}>Текущая</Tag>
                                                                    : <Button size="small" onClick={() => handleSwitchCompany(c.id)}>Переключиться</Button>}
                                                                {user?.role === 'COMPANY_ADMIN' && (myCompanies.length > 1) && (
                                                                    <Popconfirm
                                                                        title="Удалить организацию?"
                                                                        description="Доступ к её данным для вас будет закрыт."
                                                                        okText="Да, удалить"
                                                                        cancelText="Отмена"
                                                                        onConfirm={() => handleDeleteCompany(c.id)}
                                                                        okButtonProps={{ danger: true, loading: submitLoading }}
                                                                    >
                                                                        <Button size="small" danger icon={<DeleteOutlined />} />
                                                                    </Popconfirm>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                key: 'main',
                                label: 'Основная информация',
                                children: (
                                    <div className="lc-card lc-pad">
                                        <div className="lc-sec-title">Основная информация</div>
                                        <div className="lc-sec-hint" style={{ marginBottom: 18 }}>Реквизиты текущей организации подтягиваются автоматически по БИН</div>
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
                                ),
                            },
                            {
                                key: 'bank',
                                label: 'Банковские реквизиты',
                                children: (
                                    <div className="lc-card lc-pad">
                                        <div className="lc-sec-title"><BankOutlined style={{ marginRight: 8 }} />Банковские реквизиты</div>
                                        <div className="lc-sec-hint" style={{ marginBottom: 18 }}>Используются для формирования счёта на оплату. Все поля обязательны для юрлиц</div>
                                        <Row gutter={24}>
                                            <Col xs={24} md={12}>
                                                <Form.Item
                                                    name="bankAccount"
                                                    label="Расчётный счёт (IBAN)"
                                                    rules={[{ required: true, message: 'Введите расчётный счёт' }]}
                                                >
                                                    <Input size="large" placeholder="KZ123456789012345678" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={12}>
                                                <Form.Item
                                                    name="bankName"
                                                    label="Название банка"
                                                    rules={[{ required: true, message: 'Введите название банка' }]}
                                                >
                                                    <Input size="large" placeholder="АО Народный Банк" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={12}>
                                                <Form.Item
                                                    name="bankBic"
                                                    label="БИК"
                                                    rules={[{ required: true, message: 'Введите БИК' }]}
                                                >
                                                    <Input size="large" placeholder="NBRKKZKA" />
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
                                ),
                            },
                            {
                                key: 'stamp',
                                label: 'Печать и подпись',
                                children: (
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
                                ),
                            },
                        ]}
                    />

                    {(companySubTab === 'main' || companySubTab === 'bank') && (
                        <Form.Item style={{ margin: '4px 0 0' }}>
                            <Button type="primary" htmlType="submit" loading={companyLoading} className="lc-cta">
                                Сохранить данные компании
                            </Button>
                        </Form.Item>
                    )}
                    </Form>

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
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Кабинет · Организация</div>
                    <h1 className="lc2-title">Организации</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Данные и реквизиты вашей организации
                    </p>
                </div>
            </div>
            {tabItems.length > 0 ? (
                tabItems[0]?.children
            ) : (
                <div className="lc-card lc-pad" style={{ maxWidth: 640 }}>
                    <div className="lc-sec-title">Организация</div>
                    <div className="lc-sec-hint">Управление организацией доступно администратору компании. Свои данные вы можете изменить в разделе «Мой профиль».</div>
                </div>
            )}
        </div>
    );
}