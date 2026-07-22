'use client';

import { useState, useEffect } from 'react';
import { Button, Typography, Form, Input, InputNumber, App, Spin, Divider } from 'antd';
import { ArrowLeftOutlined, NumberOutlined, SaveOutlined, RetweetOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const { Text } = Typography;

export default function OrderNumberingPage() {
    const router = useRouter();
    const { message, modal } = App.useApp();
    const { user } = useAuthStore();
    const canEdit = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT' || user?.role === 'ADMIN';

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [renumbering, setRenumbering] = useState(false);
    const [form] = Form.useForm();

    const prefix = Form.useWatch('prefix', form);
    const padding = Form.useWatch('padding', form);
    const nextNumber = Form.useWatch('nextNumber', form);

    useEffect(() => { fetchSettings(); }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await api.get('/orders/numbering-settings');
            form.setFieldsValue({ prefix: res.data?.prefix || '', padding: res.data?.padding ?? 9, nextNumber: res.data?.nextNumber ?? 1 });
        } catch {
            message.error('Не удалось загрузить настройку нумерации');
        } finally {
            setLoading(false);
        }
    };

    const preview = (n: number) => `${prefix || ''}${String(Math.max(Number(n) || 1, 1)).padStart(Math.min(Math.max(Number(padding) || 9, 1), 12), '0')}`;

    const handleRenumber = () => {
        modal.confirm({
            title: 'Перенумеровать существующие заявки?',
            width: 520,
            content: (
                <div style={{ fontSize: 13 }}>
                    <p>Все заявки вашей компании получат новые номера по текущему формату (<strong>{preview(1)}, {preview(2)}…</strong>) по дате создания. Счётчик продолжится с последнего.</p>
                    <p style={{ color: 'var(--lc-text-ter)' }}>В уже распечатанных документах и старых записях истории останется прежний номер. Отменить перенумерацию нельзя.</p>
                </div>
            ),
            okText: 'Перенумеровать', okButtonProps: { danger: true }, cancelText: 'Отмена',
            onOk: async () => {
                setRenumbering(true);
                try {
                    const res = await api.post('/orders/renumber');
                    message.success(`Перенумеровано заявок: ${res.data?.renumbered ?? 0}`);
                    fetchSettings();
                } catch (e: any) {
                    message.error(e.response?.data?.message || 'Не удалось перенумеровать');
                } finally {
                    setRenumbering(false);
                }
            },
        });
    };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            await api.put('/orders/numbering-settings', {
                prefix: values.prefix || '',
                padding: values.padding,
                nextNumber: values.nextNumber,
            });
            message.success('Настройка нумерации сохранена');
            fetchSettings();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="lc-page" style={{ maxWidth: 760, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Справочники
                    </div>
                    <h1 className="lc2-title">Нумерация заявок</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0', maxWidth: 560 }}>
                        Формат номера как в 1С: порядковый номер с ведущими нулями. Можно задать префикс, длину и номер, с которого продолжить нумерацию.
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#eef2ff', color: '#4f46e5' }}><NumberOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Следующий номер</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 22 }}>{preview(nextNumber)}</div>
                            <div className="lc2-msub">так будет пронумерована новая заявка</div>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
            ) : (
                <div className="lc-card" style={{ padding: 24 }}>
                    <Form form={form} layout="vertical" onFinish={handleSave} disabled={!canEdit}>
                        <Form.Item name="prefix" label="Префикс (необязательно)" extra="Текст перед номером. Оставьте пустым для чистых цифр, как в 1С. Например: LC- или пусто.">
                            <Input size="large" maxLength={20} placeholder="без префикса" style={{ maxWidth: 260 }} />
                        </Form.Item>
                        <Form.Item name="padding" label="Длина номера (ведущие нули)" rules={[{ required: true, message: 'Укажите длину' }]} extra="Сколько знаков в числовой части: 9 → 000000001">
                            <InputNumber size="large" min={1} max={12} style={{ width: 160 }} />
                        </Form.Item>
                        <Form.Item name="nextNumber" label="Начать с номера" rules={[{ required: true, message: 'Укажите номер' }]} extra="Номер, который получит следующая созданная заявка. Удобно при переносе из старой системы.">
                            <InputNumber size="large" min={1} style={{ width: 200 }} />
                        </Form.Item>

                        <div style={{ background: 'var(--lc-hover)', borderRadius: 8, padding: '12px 16px', margin: '4px 0 20px' }}>
                            <Text type="secondary" style={{ fontSize: 12.5 }}>Пример нумерации:</Text>
                            <div style={{ fontFamily: 'monospace', fontSize: 15, marginTop: 4, letterSpacing: 0.5 }}>
                                {preview(nextNumber)} · {preview((Number(nextNumber) || 1) + 1)} · {preview((Number(nextNumber) || 1) + 2)}
                            </div>
                        </div>

                        {canEdit && (
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
                                Сохранить
                            </Button>
                        )}
                        {!canEdit && <Text type="warning" style={{ fontSize: 13 }}>Нет прав на изменение нумерации.</Text>}
                    </Form>

                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 12, margin: '16px 0 0' }}>
                        Новый формат применяется к заявкам, созданным после сохранения. Существующие заявки можно перенумеровать разом кнопкой ниже.
                    </p>

                    {canEdit && (
                        <>
                            <Divider style={{ margin: '20px 0 16px' }} />
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Перенумеровать существующие заявки</div>
                            <p style={{ color: 'var(--lc-text-ter)', fontSize: 12.5, margin: '0 0 12px', maxWidth: 560 }}>
                                Разово присвоит всем ранее созданным заявкам номера по текущему формату (по дате создания). Полезно при переходе на новую нумерацию.
                            </p>
                            <Button danger icon={<RetweetOutlined />} loading={renumbering} onClick={handleRenumber}>
                                Перенумеровать существующие заявки
                            </Button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
