'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Form, Input, Result, Select, Space, Steps, Tag, Upload, theme } from 'antd';
import { CheckCircleOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';

/**
 * Документы, которыми в Казахстане подтверждают организацию.
 *
 * Справка о госрегистрации доказывает, что юрлицо с таким БИН существует,
 * но БИН — публичные данные, поэтому связь с заявителем дают приказ о
 * назначении руководителя и его удостоверение личности.
 */
const REQUIRED_DOCUMENTS = [
    {
        type: 'COMPANY_REGISTRATION',
        title: 'Справка о государственной регистрации',
        hint: 'Электронная справка с eGov: наименование, БИН, дата регистрации',
    },
    {
        type: 'DIRECTOR_APPOINTMENT',
        title: 'Приказ о назначении руководителя',
        hint: 'Приказ или решение участника о назначении первого руководителя',
    },
    {
        type: 'DIRECTOR_ID',
        title: 'Удостоверение личности руководителя',
        hint: 'Скан или фото — сверяется с приказом',
    },
];

const STATUS_VIEW: Record<string, { label: string; color: string }> = {
    DRAFT: { label: 'Черновик', color: 'default' },
    PENDING: { label: 'На проверке', color: 'processing' },
    VERIFIED: { label: 'Подтверждена', color: 'success' },
    REJECTED: { label: 'Отклонена', color: 'error' },
};

interface VerificationState {
    verificationStatus: string;
    rejectionReason: string | null;
    canSubmit: boolean;
    missingDocuments: string[];
    documents: { id: string; type: string; fileName: string }[];
}

/**
 * Онбординг после регистрации: создать организацию и провести её через
 * проверку. До подтверждения владельцем платформы рабочие разделы закрыты.
 */
export default function CompanyOnboardingPage() {
    const router = useRouter();
    const { token } = theme.useToken();
    const [form] = Form.useForm();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [company, setCompany] = useState<{ id: string; name: string; bin: string } | null>(null);
    const [verification, setVerification] = useState<VerificationState | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/my-company');
            setCompany(res.data.company);
            setVerification(res.data.verification);
        } catch {
            toast.error('Не удалось загрузить данные организации');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const createCompany = async (values: any) => {
        try {
            setSaving(true);
            await api.post('/my-company', {
                name: values.name,
                bin: values.bin,
                type: values.type,
                directorName: values.directorName || undefined,
                address: values.address || undefined,
            });
            toast.success('Организация создана. Приложите документы для проверки');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось создать организацию');
        } finally {
            setSaving(false);
        }
    };

    const submit = async () => {
        try {
            setSaving(true);
            await api.post('/my-company/verification/submit');
            toast.success('Заявка отправлена на проверку');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось отправить заявку');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: 80 }}><Loader size="large" /></div>;
    }

    const status = verification?.verificationStatus ?? 'DRAFT';
    const step = !company ? 0 : status === 'VERIFIED' ? 2 : 1;

    return (
        <div className="lc-page" style={{ maxWidth: 760, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Организация</div>
                    <h1 className="lc2-title">Подключение организации</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        Работа с заявками и документами открывается после подтверждения организации.
                    </p>
                </div>
            </div>

            <Steps
                current={step}
                size="small"
                style={{ marginBottom: 20 }}
                items={[
                    { title: 'Организация' },
                    { title: 'Документы' },
                    { title: 'Подтверждена', icon: <CheckCircleOutlined /> },
                ]}
            />

            {!company ? (
                <div className="lc-card" style={{ padding: 24 }}>
                    <Form form={form} layout="vertical" onFinish={createCompany}>
                        <Form.Item
                            name="name"
                            label="Название организации"
                            rules={[{ required: true, message: 'Укажите название' }]}
                        >
                            <Input size="large" placeholder="ТОО «КазЛогистик»" maxLength={200} />
                        </Form.Item>
                        <Form.Item
                            name="bin"
                            label="БИН"
                            rules={[
                                { required: true, message: 'Укажите БИН' },
                                { pattern: /^\d{12}$/, message: 'БИН состоит из 12 цифр' },
                            ]}
                            extra="БИН будет сверен с приложенной справкой о государственной регистрации"
                        >
                            <Input size="large" placeholder="123456789012" maxLength={12} />
                        </Form.Item>
                        <Form.Item
                            name="type"
                            label="Вид деятельности"
                            initialValue="FORWARDER"
                            rules={[{ required: true }]}
                        >
                            <Select
                                size="large"
                                options={[
                                    { value: 'FORWARDER', label: 'Экспедитор / перевозчик' },
                                    { value: 'CUSTOMER', label: 'Заказчик перевозок' },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item name="directorName" label="Руководитель">
                            <Input size="large" placeholder="Фамилия и инициалы" maxLength={200} />
                        </Form.Item>
                        <Form.Item name="address" label="Юридический адрес">
                            <Input size="large" maxLength={500} />
                        </Form.Item>
                        <Button type="primary" size="large" htmlType="submit" loading={saving} block>
                            Создать организацию
                        </Button>
                    </Form>
                </div>
            ) : status === 'VERIFIED' ? (
                <Result
                    status="success"
                    title="Организация подтверждена"
                    subTitle={`${company.name} · БИН ${company.bin}. Все разделы открыты.`}
                    extra={
                        <Button type="primary" onClick={() => router.push('/company')}>
                            В рабочий кабинет
                        </Button>
                    }
                />
            ) : (
                <div className="lc-card" style={{ padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{company.name}</div>
                            <div style={{ fontSize: 12, color: token.colorTextSecondary }}>БИН {company.bin}</div>
                        </div>
                        <Tag color={STATUS_VIEW[status]?.color}>{STATUS_VIEW[status]?.label}</Tag>
                    </div>

                    {status === 'REJECTED' && (
                        <Alert
                            type="error"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message="Заявка отклонена"
                            description={
                                <>
                                    {verification?.rejectionReason}
                                    <div style={{ marginTop: 6, fontSize: 12 }}>
                                        Исправьте замечание, замените документ и отправьте заявку заново.
                                    </div>
                                </>
                            }
                        />
                    )}

                    {status === 'PENDING' && (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message="Заявка на проверке"
                            description="Мы сверяем документы. Как только организация будет подтверждена, разделы откроются."
                        />
                    )}

                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        {REQUIRED_DOCUMENTS.map((document) => {
                            const attached = verification?.documents.find((d) => d.type === document.type);
                            return (
                                <div
                                    key={document.type}
                                    className="lc-card"
                                    style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>{document.title}</div>
                                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                            {document.hint}
                                        </div>
                                        {attached && (
                                            <div style={{ fontSize: 11, color: token.colorSuccess, marginTop: 4 }}>
                                                <CheckCircleOutlined /> {attached.fileName}
                                            </div>
                                        )}
                                    </div>
                                    <Upload
                                        showUploadList={false}
                                        accept=".pdf,.png,.jpg,.jpeg"
                                        disabled={status === 'PENDING'}
                                        customRequest={async ({ file, onSuccess, onError }) => {
                                            const data = new FormData();
                                            data.append('file', file as File);
                                            try {
                                                await api.post(
                                                    `/my-company/verification/documents/${document.type}`,
                                                    data,
                                                );
                                                toast.success('Документ приложен');
                                                await load();
                                                onSuccess?.({});
                                            } catch (e: any) {
                                                toast.error(e.response?.data?.message || 'Не удалось загрузить');
                                                onError?.(e);
                                            }
                                        }}
                                    >
                                        <Button
                                            size="small"
                                            icon={attached ? <UploadOutlined /> : <InboxOutlined />}
                                            disabled={status === 'PENDING'}
                                        >
                                            {attached ? 'Заменить' : 'Загрузить'}
                                        </Button>
                                    </Upload>
                                </div>
                            );
                        })}
                    </Space>

                    <Button
                        type="primary"
                        size="large"
                        block
                        style={{ marginTop: 18 }}
                        loading={saving}
                        disabled={!verification?.canSubmit}
                        onClick={submit}
                    >
                        {status === 'PENDING' ? 'Заявка на проверке' : 'Отправить на проверку'}
                    </Button>
                    {!verification?.canSubmit && status !== 'PENDING' && (
                        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 8, textAlign: 'center' }}>
                            Приложите все три документа, чтобы отправить заявку
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
