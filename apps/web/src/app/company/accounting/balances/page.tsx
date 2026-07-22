'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Typography, Tag, message } from 'antd';
import { ArrowLeftOutlined, WalletOutlined, BankOutlined, SettingOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Text } = Typography;

interface AccountBalance {
    id: string;
    name: string;
    kind: 'CASH' | 'BANK';
    openingBalance: number;
    openingDate: string | null;
    totalIn: number;
    totalOut: number;
    balance: number;
}

export default function AccountBalancesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<AccountBalance[]>([]);
    const [totals, setTotals] = useState<{ openingBalance: number; totalIn: number; totalOut: number; balance: number }>({ openingBalance: 0, totalIn: 0, totalOut: 0, balance: 0 });

    useEffect(() => { fetchBalances(); }, []);

    const fetchBalances = async () => {
        setLoading(true);
        try {
            const res = await api.get('/accounting/account-balances');
            setAccounts(res.data?.accounts || []);
            setTotals(res.data?.totals || { openingBalance: 0, totalIn: 0, totalOut: 0, balance: 0 });
        } catch {
            message.error('Не удалось загрузить остатки');
        } finally {
            setLoading(false);
        }
    };

    const money = (v: number) => v.toLocaleString('ru-RU') + ' ₸';

    const columns = [
        {
            title: 'Счёт / касса',
            dataIndex: 'name',
            key: 'name',
            render: (val: string, r: AccountBalance) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {r.kind === 'CASH'
                        ? <WalletOutlined style={{ color: '#16a34a' }} />
                        : <BankOutlined style={{ color: '#0369a1' }} />}
                    <span style={{ fontWeight: 600 }}>{val}</span>
                    <Tag color={r.kind === 'CASH' ? 'green' : 'blue'} style={{ margin: 0 }}>{r.kind === 'CASH' ? 'касса' : 'счёт'}</Tag>
                </span>
            ),
        },
        {
            title: 'Начальный остаток',
            key: 'opening',
            align: 'right' as const,
            render: (_: any, r: AccountBalance) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontVariantNumeric: 'tabular-nums' }}>{money(r.openingBalance)}</div>
                    {r.openingDate && <div style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>на {dayjs(r.openingDate).format('DD.MM.YYYY')}</div>}
                </div>
            ),
        },
        {
            title: 'Приход',
            dataIndex: 'totalIn',
            key: 'in',
            align: 'right' as const,
            render: (v: number) => <span style={{ color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>+{money(v)}</span>,
        },
        {
            title: 'Расход',
            dataIndex: 'totalOut',
            key: 'out',
            align: 'right' as const,
            render: (v: number) => <span style={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>−{money(v)}</span>,
        },
        {
            title: 'Текущий остаток',
            dataIndex: 'balance',
            key: 'balance',
            align: 'right' as const,
            render: (v: number) => <strong style={{ fontSize: 15, color: v >= 0 ? 'var(--lc-text)' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{money(v)}</strong>,
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Остатки
                    </div>
                    <h1 className="lc2-title">Остатки по кассам</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Сколько денег сейчас на каждом счёте и в кассе: начальный остаток + приход − расход.
                    </p>
                    <Button icon={<SettingOutlined />} onClick={() => router.push('/company/accounting/settings?tab=accounts')}>
                        Ввести начальные остатки
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <WalletOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Всего денег</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: totals.balance >= 0 ? undefined : '#dc2626' }}>{money(totals.balance)}</div>
                            <div className="lc2-msub">на счетах и в кассах</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table
                    columns={columns}
                    dataSource={accounts}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    locale={{ emptyText: 'Нет счетов и касс' }}
                    summary={() => accounts.length > 0 ? (
                        <Table.Summary fixed>
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0}><strong>Итого</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(totals.openingBalance)}</span></Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right"><span style={{ color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>+{money(totals.totalIn)}</span></Table.Summary.Cell>
                                <Table.Summary.Cell index={3} align="right"><span style={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>−{money(totals.totalOut)}</span></Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="right"><strong style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{money(totals.balance)}</strong></Table.Summary.Cell>
                            </Table.Summary.Row>
                        </Table.Summary>
                    ) : null}
                />
            </div>

            <p style={{ color: 'var(--lc-text-ter)', fontSize: 12.5, margin: '14px 4px 0' }}>
                Остаток считается по операциям, у которых указана касса/счёт. Если цифра не сходится — задайте начальный остаток на дату начала учёта в настройках счёта и указывайте кассу/счёт при вводе доходов и расходов.
            </p>
        </div>
    );
}
