'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { Button, Select, Spin, Empty, App } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';

interface Party {
    id: string;
    name: string;
    bin: string | null;
    address: string | null;
    directorName: string | null;
    bankAccount: string | null;
    bankName: string | null;
    bankBic: string | null;
    kbe: string | null;
}
interface ActData {
    order: { id: string; orderNumber: string; createdAt: string; completedAt: string | null; cargoDescription: string | null; route: string };
    issuer: Party | null;
    recipient: Party | null;
    service: { name: string; unit: string };
    services: { id: string; name: string; unit: string }[];
    amount: { net: number; vat: number; gross: number; hasVat: boolean; vatRate: number };
    actNumber: string;
    actDate: string;
    generatedAt: string;
}

const fmt = (n: number) => (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ActOfWorkInner() {
    const router = useRouter();
    const params = useSearchParams();
    const { message } = App.useApp();
    const orderId = params.get('order') || '';

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ActData | null>(null);
    const [serviceName, setServiceName] = useState<string>('');

    const fetchAct = useCallback(async () => {
        if (!orderId) { setLoading(false); return; }
        setLoading(true);
        try {
            const res = await api.get(`/accounting/act-of-work/${orderId}`);
            setData(res.data);
            setServiceName(res.data?.service?.name || '');
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось сформировать акт');
        } finally {
            setLoading(false);
        }
    }, [orderId, message]);

    useEffect(() => { fetchAct(); }, [fetchAct]);

    if (!orderId) {
        return <div className="lc-page" style={{ maxWidth: 900, margin: '0 auto' }}><Empty description="Заявка не выбрана" /></div>;
    }

    const requisites = (p: Party | null) => {
        if (!p) return null;
        const lines: string[] = [];
        if (p.bin) lines.push(`БИН/ИИН: ${p.bin}`);
        if (p.address) lines.push(`Адрес: ${p.address}`);
        if (p.bankAccount) lines.push(`ИИК: ${p.bankAccount}${p.bankBic ? `, БИК: ${p.bankBic}` : ''}`);
        if (p.bankName) lines.push(`Банк: ${p.bankName}${p.kbe ? `, КБе: ${p.kbe}` : ''}`);
        return lines;
    };

    return (
        <div className="lc-page act-wrap" style={{ maxWidth: 900, margin: '0 auto' }}>
            {/* Управление — не печатается */}
            <div className="act-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push(`/company/orders/${orderId}`)}>
                    К заявке
                </Button>
                {data && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--lc-text-ter)' }}>Наименование услуги:</span>
                        <Select
                            value={serviceName}
                            onChange={setServiceName}
                            style={{ minWidth: 320 }}
                            showSearch
                            options={data.services.map(s => ({ value: s.name, label: s.name }))}
                        />
                    </span>
                )}
                <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()} disabled={!data} style={{ marginLeft: 'auto' }}>
                    Печать / Сохранить PDF
                </Button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
            ) : !data ? (
                <Empty description="Нет данных" />
            ) : (
                <div className="act-doc lc-card" style={{ padding: 40 }}>
                    <h1 style={{ textAlign: 'center', fontSize: 19, fontWeight: 700, margin: '0 0 2px' }}>
                        Акт выполненных работ (оказанных услуг) № {data.actNumber}
                    </h1>
                    <p style={{ textAlign: 'center', color: 'var(--lc-text-ter)', margin: '0 0 24px', fontSize: 13 }}>
                        от {dayjs(data.actDate).format('DD.MM.YYYY')}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 18, fontSize: 12.5 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ color: 'var(--lc-text-ter)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Исполнитель</div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{data.issuer?.name || '—'}</div>
                            {requisites(data.issuer)?.map((l, i) => <div key={i} style={{ color: 'var(--lc-text-sec)' }}>{l}</div>)}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ color: 'var(--lc-text-ter)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Заказчик</div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{data.recipient?.name || '—'}</div>
                            {requisites(data.recipient)?.map((l, i) => <div key={i} style={{ color: 'var(--lc-text-sec)' }}>{l}</div>)}
                        </div>
                    </div>

                    <div style={{ fontSize: 12.5, color: 'var(--lc-text-sec)', margin: '0 0 12px' }}>
                        Основание: заявка № {data.order.orderNumber}{data.order.route ? `, маршрут: ${data.order.route}` : ''}{data.order.cargoDescription ? `, груз: ${data.order.cargoDescription}` : ''}.
                    </div>

                    <table className="act-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                            <tr>
                                <th style={{ width: 36, textAlign: 'center' }}>№</th>
                                <th style={{ textAlign: 'left' }}>Наименование работ, услуг</th>
                                <th style={{ width: 70, textAlign: 'center' }}>Кол-во</th>
                                <th style={{ width: 70, textAlign: 'center' }}>Ед.</th>
                                <th style={{ width: 130, textAlign: 'right' }}>Цена, ₸</th>
                                <th style={{ width: 130, textAlign: 'right' }}>Сумма, ₸</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ textAlign: 'center' }}>1</td>
                                <td>{serviceName || data.service.name}</td>
                                <td style={{ textAlign: 'center' }}>1</td>
                                <td style={{ textAlign: 'center' }}>{data.service.unit}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(data.amount.net)}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(data.amount.net)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '3px 16px 3px 0', color: 'var(--lc-text-sec)' }}>Итого без НДС:</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.amount.net)} ₸</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '3px 16px 3px 0', color: 'var(--lc-text-sec)' }}>
                                        НДС {data.amount.hasVat ? `${data.amount.vatRate}%` : '(не облагается)'}:
                                    </td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.amount.vat)} ₸</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '6px 16px 3px 0', fontWeight: 700, borderTop: '1px solid #333' }}>Итого к оплате:</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderTop: '1px solid #333' }}>{fmt(data.amount.gross)} ₸</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <p style={{ fontSize: 12.5, margin: '18px 0 0' }}>
                        Всего оказано услуг на сумму <strong>{fmt(data.amount.gross)} ₸</strong>
                        {data.amount.hasVat ? <>, в том числе НДС {data.amount.vatRate}% — {fmt(data.amount.vat)} ₸</> : ' (без НДС)'}.
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--lc-text-ter)', margin: '4px 0 0' }}>
                        Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.
                    </p>

                    <div className="act-signs" style={{ display: 'flex', justifyContent: 'space-between', gap: 40, marginTop: 44 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>Исполнитель</div>
                            <div style={{ marginTop: 30, borderTop: '1px solid #333', paddingTop: 4, fontSize: 11, color: 'var(--lc-text-ter)' }}>
                                {data.issuer?.directorName || 'подпись'} · М.П.
                            </div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>Заказчик</div>
                            <div style={{ marginTop: 30, borderTop: '1px solid #333', paddingTop: 4, fontSize: 11, color: 'var(--lc-text-ter)' }}>
                                {data.recipient?.directorName || 'подпись'} · М.П.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .act-table th {
                    border: 1px solid #333;
                    padding: 6px 8px;
                    font-size: 11px;
                    background: var(--lc-hover);
                }
                .act-table td {
                    border: 1px solid #333;
                    padding: 6px 8px;
                    font-variant-numeric: tabular-nums;
                }
                @media print {
                    .act-controls, .lc-app-nav, nav, header, .ant-layout-sider, .ant-layout-header { display: none !important; }
                    .act-doc { box-shadow: none !important; border: none !important; padding: 0 !important; }
                    .act-wrap { max-width: 100% !important; }
                    body { background: #fff !important; }
                    .act-table th { background: #f3f3f3 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>
        </div>
    );
}

export default function ActOfWorkPage() {
    return (
        <Suspense fallback={<div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>}>
            <ActOfWorkInner />
        </Suspense>
    );
}
