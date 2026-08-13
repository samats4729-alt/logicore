'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Typography, Tag } from 'antd';
import { ArrowLeftOutlined, WalletOutlined, BankOutlined, SettingOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import { money as formatMoney } from '@/lib/money-format';

const { Text } = Typography;

interface AccountBalance {
    id: string;
    name: string;
    kind: 'CASH' | 'BANK';
    currency: string;
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
    // Итоги по каждой валюте отдельно: доллары и тенге в одну сумму не
    // складываются — такого числа нет ни в одном банке.
    const [byCurrency, setByCurrency] = useState<{ currency: string; totalIn: number; totalOut: number; balance: number }[]>([]);

    useEffect(() => { fetchBalances(); }, []);

    const fetchBalances = async () => {
        setLoading(true);
        try {
            const res = await api.get('/accounting/account-balances');
            setAccounts(res.data?.accounts || []);
            setTotals(res.data?.totals || { openingBalance: 0, totalIn: 0, totalOut: 0, balance: 0 });
            setByCurrency(res.data?.byCurrency || []);
        } catch {
            toast.error('Не удалось загрузить остатки');
        } finally {
            setLoading(false);
        }
    };

    const money = (v: number, currency = 'KZT') => formatMoney(v, currency);

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
                    <span className={nova.chip}>{r.kind === 'CASH' ? 'касса' : 'счёт'}</span>
                    {r.currency && r.currency !== 'KZT' && (
                        <span className={nova.chip}>{r.currency}</span>
                    )}
                </span>
            ),
        },
        {
            title: 'Начальный остаток',
            key: 'opening',
            align: 'right' as const,
            render: (_: any, r: AccountBalance) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontVariantNumeric: 'tabular-nums' }}>{money(r.openingBalance, r.currency)}</div>
                    {r.openingDate && <div style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>на {dayjs(r.openingDate).format('DD.MM.YYYY')}</div>}
                </div>
            ),
        },
        {
            title: 'Приход',
            dataIndex: 'totalIn',
            key: 'in',
            align: 'right' as const,
            // Знак у нуля не ставим: «+0,00 ₸» читается как движение, которого не было.
            render: (v: number, r: AccountBalance) => <span style={{ color: v ? '#16a34a' : 'var(--lc-text-ter)', fontVariantNumeric: 'tabular-nums' }}>{v ? '+' : ''}{money(v, r.currency)}</span>,
        },
        {
            title: 'Расход',
            dataIndex: 'totalOut',
            key: 'out',
            align: 'right' as const,
            render: (v: number, r: AccountBalance) => <span style={{ color: v ? '#dc2626' : 'var(--lc-text-ter)', fontVariantNumeric: 'tabular-nums' }}>{v ? '−' : ''}{money(v, r.currency)}</span>,
        },
        {
            title: 'Текущий остаток',
            dataIndex: 'balance',
            key: 'balance',
            align: 'right' as const,
            render: (v: number, r: AccountBalance) => <strong style={{ fontSize: 15, color: v >= 0 ? 'var(--lc-text)' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{money(v, r.currency)}</strong>,
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
                            <div className="lc2-mlabel">Всего тенге</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: totals.balance >= 0 ? undefined : '#dc2626' }}>{money(totals.balance)}</div>
                            <div className="lc2-msub">на тенговых счетах и в кассах</div>
                        </div>
                    </div>
                    {byCurrency.filter((row) => row.currency !== 'KZT').map((row) => (
                        <div className="lc2-metric" key={row.currency}>
                            <div className="lc2-mic" style={{ background: '#fef3c7', color: '#b45309' }}>
                                <BankOutlined />
                            </div>
                            <div>
                                <div className="lc2-mlabel">Всего {row.currency}</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: row.balance >= 0 ? undefined : '#dc2626' }}>{money(row.balance, row.currency)}</div>
                                <div className="lc2-msub">валютные счета</div>
                            </div>
                        </div>
                    ))}
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
                                <Table.Summary.Cell index={0}><strong>Итого в тенге</strong></Table.Summary.Cell>
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
                {byCurrency.some((row) => row.currency !== 'KZT') && (
                    <> Валютные счета показаны в своей валюте и в общий тенговый итог не входят: пересчёт в тенге зависит от курса на день и делается в отчётах.</>
                )}
            </p>
        </div>
    );
}
