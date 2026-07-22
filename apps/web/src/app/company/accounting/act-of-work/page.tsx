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
    phone: string | null;
    email: string | null;
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

// «полное наименование, адрес, данные о средствах связи»
const partyLine = (p: Party | null) => {
    if (!p) return '';
    const bits = [p.name];
    if (p.bin) bits.push(`ИИН/БИН ${p.bin}`);
    if (p.address) bits.push(p.address);
    if (p.phone) bits.push(`тел. ${p.phone}`);
    if (p.email) bits.push(p.email);
    return bits.join(', ');
};

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
        return <div className="lc-page" style={{ maxWidth: 960, margin: '0 auto' }}><Empty description="Заявка не выбрана" /></div>;
    }

    const workDate = data?.order.completedAt ? dayjs(data.order.completedAt).format('DD.MM.YYYY') : (data ? dayjs(data.actDate).format('DD.MM.YYYY') : '');

    return (
        <div className="lc-page act-wrap" style={{ maxWidth: 960, margin: '0 auto' }}>
            {/* Управление — не печатается */}
            <div className="act-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push(`/company/orders/${orderId}`)}>К заявке</Button>
                {data && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--lc-text-ter)' }}>Наименование услуги:</span>
                        <Select value={serviceName} onChange={setServiceName} style={{ minWidth: 340 }} showSearch
                            options={data.services.map(s => ({ value: s.name, label: s.name }))} />
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
                    {/* Шапка формы Р-1 */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                        <div style={{ textAlign: 'right', fontSize: 10.5, lineHeight: 1.35, color: 'var(--lc-text-sec)' }}>
                            <div>Приложение 50</div>
                            <div>к приказу Министра финансов</div>
                            <div>Республики Казахстан</div>
                            <div>от 20 декабря 2012 года № 562</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>Форма Р-1</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                            <span>ИИН/БИН</span>
                            <span style={{ border: '1px solid #333', padding: '2px 12px', minWidth: 130, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{data.issuer?.bin || ''}</span>
                        </div>
                    </div>

                    {/* Заказчик / Исполнитель */}
                    <div style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>Заказчик</span>
                            <span style={{ flex: 1, borderBottom: '1px solid #333', fontSize: 12.5, paddingBottom: 1 }}>{partyLine(data.recipient)}</span>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 9.5, color: 'var(--lc-text-ter)', fontStyle: 'italic' }}>полное наименование, адрес, данные о средствах связи</div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>Исполнитель</span>
                            <span style={{ flex: 1, borderBottom: '1px solid #333', fontSize: 12.5, paddingBottom: 1 }}>{partyLine(data.issuer)}</span>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 9.5, color: 'var(--lc-text-ter)', fontStyle: 'italic' }}>полное наименование, адрес, данные о средствах связи</div>
                    </div>

                    {/* Договор / номер / дата */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14, fontSize: 11.5 }}>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #333', padding: '4px 8px', width: '60%' }}>
                                    Договор (контракт){data.order.orderNumber ? ` — основание: заявка № ${data.order.orderNumber}` : ''}
                                </td>
                                <td style={{ border: '1px solid #333', padding: '4px 8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 9.5, color: 'var(--lc-text-ter)' }}>Номер документа</div>
                                    <div style={{ fontWeight: 600 }}>{data.actNumber}</div>
                                </td>
                                <td style={{ border: '1px solid #333', padding: '4px 8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 9.5, color: 'var(--lc-text-ter)' }}>Дата составления</div>
                                    <div style={{ fontWeight: 600 }}>{dayjs(data.actDate).format('DD.MM.YYYY')}</div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <h1 style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)</h1>

                    {/* Основная таблица формы Р-1 */}
                    <table className="act-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                        <thead>
                            <tr>
                                <th style={{ width: 34 }}>Номер по порядку</th>
                                <th>Наименование работ (услуг)</th>
                                <th style={{ width: 82 }}>Дата выполнения работ (оказания услуг)</th>
                                <th style={{ width: 90 }}>Сведения об отчёте (при наличии)</th>
                                <th style={{ width: 60 }}>Единица измерения</th>
                                <th style={{ width: 58 }}>Количество</th>
                                <th style={{ width: 90 }}>Цена за единицу</th>
                                <th style={{ width: 100 }}>Стоимость</th>
                            </tr>
                            <tr className="act-numrow">
                                <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ textAlign: 'center' }}>1</td>
                                <td>{serviceName || data.service.name}{data.order.route ? ` (${data.order.route})` : ''}</td>
                                <td style={{ textAlign: 'center' }}>{workDate}</td>
                                <td style={{ textAlign: 'center' }}>—</td>
                                <td style={{ textAlign: 'center' }}>{data.service.unit}</td>
                                <td style={{ textAlign: 'center' }}>1</td>
                                <td style={{ textAlign: 'right' }}>{fmt(data.amount.gross)}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(data.amount.gross)}</td>
                            </tr>
                            <tr className="act-total">
                                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>Итого</td>
                                <td style={{ textAlign: 'center' }}>х</td>
                                <td style={{ textAlign: 'center' }}>1</td>
                                <td style={{ textAlign: 'center' }}>х</td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(data.amount.gross)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <p style={{ fontSize: 11.5, margin: '10px 0 0' }}>
                        Всего оказано услуг на сумму: <strong>{fmt(data.amount.gross)} ₸</strong>
                        {data.amount.hasVat
                            ? <>, в том числе НДС {data.amount.vatRate}% — {fmt(data.amount.vat)} ₸</>
                            : <> (без НДС)</>}.
                    </p>

                    <div style={{ fontSize: 11, marginTop: 12 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <span style={{ whiteSpace: 'nowrap' }}>Сведения об использовании запасов, полученных от заказчика:</span>
                            <span style={{ flex: 1, borderBottom: '1px solid #333' }}>&nbsp;</span>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 9.5, color: 'var(--lc-text-ter)', fontStyle: 'italic', marginRight: 90 }}>наименование, количество, стоимость</div>
                    </div>

                    <div style={{ fontSize: 11, marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                        <span>Приложение: Перечень документации (при наличии) на</span>
                        <span style={{ borderBottom: '1px solid #333', minWidth: 40, textAlign: 'center' }}>&nbsp;</span>
                        <span>страниц</span>
                    </div>

                    {/* Подписи */}
                    <div className="act-signs" style={{ display: 'flex', justifyContent: 'space-between', gap: 40, marginTop: 30 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Сдал (Исполнитель)</div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', fontSize: 11 }}>
                                <span style={{ flex: 1, borderBottom: '1px solid #333', textAlign: 'center', paddingBottom: 1 }}>&nbsp;</span>
                                <span>/</span>
                                <span style={{ flex: 1, borderBottom: '1px solid #333' }}>&nbsp;</span>
                                <span>/</span>
                                <span style={{ flex: 1.4, borderBottom: '1px solid #333', textAlign: 'center', paddingBottom: 1 }}>{data.issuer?.directorName || ''}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, fontSize: 8.5, color: 'var(--lc-text-ter)', marginTop: 2 }}>
                                <span style={{ flex: 1, textAlign: 'center' }}>должность</span><span>&nbsp;</span>
                                <span style={{ flex: 1, textAlign: 'center' }}>подпись</span><span>&nbsp;</span>
                                <span style={{ flex: 1.4, textAlign: 'center' }}>расшифровка подписи</span>
                            </div>
                            <div style={{ marginTop: 14, fontSize: 11 }}>М.П.</div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Принял (Заказчик)</div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', fontSize: 11 }}>
                                <span style={{ flex: 1, borderBottom: '1px solid #333', textAlign: 'center', paddingBottom: 1 }}>&nbsp;</span>
                                <span>/</span>
                                <span style={{ flex: 1, borderBottom: '1px solid #333' }}>&nbsp;</span>
                                <span>/</span>
                                <span style={{ flex: 1.4, borderBottom: '1px solid #333', textAlign: 'center', paddingBottom: 1 }}>{data.recipient?.directorName || ''}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, fontSize: 8.5, color: 'var(--lc-text-ter)', marginTop: 2 }}>
                                <span style={{ flex: 1, textAlign: 'center' }}>должность</span><span>&nbsp;</span>
                                <span style={{ flex: 1, textAlign: 'center' }}>подпись</span><span>&nbsp;</span>
                                <span style={{ flex: 1.4, textAlign: 'center' }}>расшифровка подписи</span>
                            </div>
                            <div style={{ marginTop: 14, fontSize: 11 }}>М.П.</div>
                        </div>
                    </div>

                    <div style={{ fontSize: 11, marginTop: 18, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                        <span>Дата подписания (принятия) работ (услуг):</span>
                        <span style={{ borderBottom: '1px solid #333', minWidth: 120 }}>&nbsp;</span>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .act-table th, .act-table td { border: 1px solid #333; padding: 4px 6px; vertical-align: middle; }
                .act-table th { background: var(--lc-hover); font-weight: 600; text-align: center; line-height: 1.2; }
                .act-table tr.act-numrow th { font-weight: 400; font-style: italic; }
                .act-table td { font-variant-numeric: tabular-nums; }
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
