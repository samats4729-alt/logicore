'use client';

import { useState, useEffect, useMemo } from 'react';
import { Tabs, Table, Button, Typography, Modal, Form, InputNumber, DatePicker, Input, Tag, App } from 'antd';
import { ArrowLeftOutlined, EditOutlined, BankOutlined, InboxOutlined, CarOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Text } = Typography;

interface AccountRow {
    id: string;
    name: string;
    kind: string;
    openingBalance: number;
    openingDate: string | null;
    balance: number;
}
interface Partner {
    id: string;
    name: string;
    isCustomer?: boolean;
    isCarrier?: boolean;
}
interface Opening {
    counterpartyId: string;
    openingReceivable: number;
    openingPayable: number;
    openingDate: string | null;
    note: string | null;
}

const moneyFmt = (v: any) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const moneyParse = (v: any) => (v || '').replace(/\s/g, '');
const money = (v: number) => (v || 0).toLocaleString('ru-RU') + ' ₸';

export default function OpeningBalancesPage() {
    const router = useRouter();
    const { message } = App.useApp();

    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<AccountRow[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [openings, setOpenings] = useState<Opening[]>([]);

    // Модалка счёта
    const [accModal, setAccModal] = useState<AccountRow | null>(null);
    const [accForm] = Form.useForm();
    // Модалка контрагента
    const [cpModal, setCpModal] = useState<{ partner: Partner; side: 'receivable' | 'payable' } | null>(null);
    const [cpForm] = Form.useForm();

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [accRes, partRes, openRes] = await Promise.all([
                api.get('/accounting/account-balances'),
                api.get('/partners'),
                api.get('/accounting/counterparty-openings'),
            ]);
            setAccounts(accRes.data?.accounts || []);
            setPartners((partRes.data || []).filter((p: Partner) => p && p.id));
            setOpenings(openRes.data || []);
        } catch {
            message.error('Не удалось загрузить остатки');
        } finally {
            setLoading(false);
        }
    };

    const openingFor = (id: string) => openings.find(o => o.counterpartyId === id);

    // ===== Счета =====
    const openAcc = (r: AccountRow) => {
        setAccModal(r);
        accForm.setFieldsValue({ openingBalance: r.openingBalance || 0, openingDate: r.openingDate ? dayjs(r.openingDate) : null });
    };
    const saveAcc = async (vals: any) => {
        if (!accModal) return;
        try {
            await api.put(`/accounting/finance-accounts/${accModal.id}`, {
                openingBalance: vals.openingBalance ?? 0,
                openingDate: vals.openingDate ? vals.openingDate.toISOString() : null,
            });
            message.success('Начальный остаток сохранён');
            setAccModal(null);
            fetchAll();
        } catch {
            message.error('Не удалось сохранить');
        }
    };

    // ===== Контрагенты =====
    const openCp = (partner: Partner, side: 'receivable' | 'payable') => {
        const o = openingFor(partner.id);
        setCpModal({ partner, side });
        cpForm.setFieldsValue({
            amount: side === 'receivable' ? (o?.openingReceivable || 0) : (o?.openingPayable || 0),
            openingDate: o?.openingDate ? dayjs(o.openingDate) : null,
            note: o?.note || '',
        });
    };
    const saveCp = async (vals: any) => {
        if (!cpModal) return;
        const { partner, side } = cpModal;
        const existing = openingFor(partner.id);
        const payload = {
            openingReceivable: side === 'receivable' ? (vals.amount ?? 0) : (existing?.openingReceivable ?? 0),
            openingPayable: side === 'payable' ? (vals.amount ?? 0) : (existing?.openingPayable ?? 0),
            openingDate: vals.openingDate ? vals.openingDate.toISOString() : null,
            note: vals.note || null,
        };
        try {
            await api.put(`/accounting/counterparty-openings/${partner.id}`, payload);
            message.success('Начальный долг сохранён');
            setCpModal(null);
            fetchAll();
        } catch {
            message.error('Не удалось сохранить');
        }
    };

    const customers = useMemo(() => partners.filter(p => p.isCustomer !== false), [partners]);
    const carriers = useMemo(() => partners.filter(p => p.isCarrier), [partners]);

    const kindLabel = (k: string) => k === 'BANK' ? 'Банк' : k === 'CASH' ? 'Касса' : k;

    const accColumns = [
        { title: 'Счёт / касса', dataIndex: 'name', key: 'name', render: (v: string, r: AccountRow) => <span><Tag>{kindLabel(r.kind)}</Tag> {v}</span> },
        { title: 'Начальный остаток', dataIndex: 'openingBalance', key: 'ob', align: 'right' as const, render: (v: number) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(v)}</strong> },
        { title: 'На дату', dataIndex: 'openingDate', key: 'od', width: 130, render: (d: string | null) => d ? dayjs(d).format('DD.MM.YYYY') : <Text type="secondary">—</Text> },
        { title: 'Текущий остаток', dataIndex: 'balance', key: 'bal', align: 'right' as const, render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums', color: v < 0 ? '#dc2626' : undefined }}>{money(v)}</span> },
        { title: '', key: 'act', width: 60, render: (_: any, r: AccountRow) => <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openAcc(r)} /> },
    ];

    const cpColumns = (side: 'receivable' | 'payable') => [
        { title: 'Контрагент', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
        {
            title: side === 'receivable' ? 'Нам должны (начальный)' : 'Мы должны (начальный)',
            key: 'amt',
            align: 'right' as const,
            width: 220,
            render: (_: any, p: Partner) => {
                const o = openingFor(p.id);
                const amt = side === 'receivable' ? (o?.openingReceivable || 0) : (o?.openingPayable || 0);
                return amt > 0
                    ? <strong style={{ fontVariantNumeric: 'tabular-nums', color: side === 'receivable' ? '#16a34a' : '#dc2626' }}>{money(amt)}</strong>
                    : <Text type="secondary">не задан</Text>;
            },
        },
        {
            title: 'На дату', key: 'od', width: 130,
            render: (_: any, p: Partner) => { const o = openingFor(p.id); return o?.openingDate ? dayjs(o.openingDate).format('DD.MM.YYYY') : <Text type="secondary">—</Text>; },
        },
        { title: '', key: 'act', width: 90, render: (_: any, p: Partner) => <Button size="small" icon={<EditOutlined />} onClick={() => openCp(p, side)}>Задать</Button> },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Настройка
                    </div>
                    <h1 className="lc2-title">Ввод начальных остатков</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0', maxWidth: 620 }}>
                        Один раз при старте учёта укажите, сколько денег было на счетах и кто кому был должен. Дальше система считает всё сама — эти цифры станут отправной точкой для взаиморасчётов и остатков.
                    </p>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16 }}>
                <Tabs
                    defaultActiveKey="accounts"
                    items={[
                        {
                            key: 'accounts',
                            label: <span><BankOutlined /> Счета и кассы</span>,
                            children: (
                                <Table rowKey="id" loading={loading} columns={accColumns} dataSource={accounts} size="small" pagination={false}
                                    locale={{ emptyText: 'Нет счетов' }} />
                            ),
                        },
                        {
                            key: 'customers',
                            label: <span><InboxOutlined /> Заказчики (нам должны)</span>,
                            children: (
                                <Table rowKey="id" loading={loading} columns={cpColumns('receivable')} dataSource={customers} size="small"
                                    pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'Нет заказчиков' }} />
                            ),
                        },
                        {
                            key: 'carriers',
                            label: <span><CarOutlined /> Перевозчики (мы должны)</span>,
                            children: (
                                <Table rowKey="id" loading={loading} columns={cpColumns('payable')} dataSource={carriers} size="small"
                                    pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'Нет перевозчиков' }} />
                            ),
                        },
                    ]}
                />
            </div>

            {/* Модалка счёта */}
            <Modal open={!!accModal} title={`Начальный остаток — ${accModal?.name || ''}`} onCancel={() => setAccModal(null)} onOk={() => accForm.submit()} okText="Сохранить" cancelText="Отмена" destroyOnClose>
                <Form form={accForm} layout="vertical" onFinish={saveAcc} style={{ marginTop: 12 }}>
                    <Form.Item name="openingBalance" label="Сумма на счёте на дату начала">
                        <InputNumber size="large" style={{ width: '100%' }} min={0} formatter={moneyFmt} parser={moneyParse} addonAfter="₸" />
                    </Form.Item>
                    <Form.Item name="openingDate" label="Дата начала учёта">
                        <DatePicker size="large" style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="Дата" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Модалка контрагента */}
            <Modal open={!!cpModal} title={cpModal ? `${cpModal.side === 'receivable' ? 'Нам должны' : 'Мы должны'} — ${cpModal.partner.name}` : ''} onCancel={() => setCpModal(null)} onOk={() => cpForm.submit()} okText="Сохранить" cancelText="Отмена" destroyOnClose>
                <Form form={cpForm} layout="vertical" onFinish={saveCp} style={{ marginTop: 12 }}>
                    <Form.Item name="amount" label={cpModal?.side === 'receivable' ? 'Долг заказчика перед нами на дату начала' : 'Наш долг перед перевозчиком на дату начала'}>
                        <InputNumber size="large" style={{ width: '100%' }} min={0} formatter={moneyFmt} parser={moneyParse} addonAfter="₸" />
                    </Form.Item>
                    <Form.Item name="openingDate" label="На дату">
                        <DatePicker size="large" style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="Дата" />
                    </Form.Item>
                    <Form.Item name="note" label="Примечание (необязательно)">
                        <Input placeholder="Например: акт сверки на 01.01" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
