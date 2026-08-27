'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { Alert, Button, DatePicker, Empty } from 'antd';
import {
    ArrowLeftOutlined,
    CalendarOutlined,
    FileAddOutlined,
    FilePdfOutlined,
    PrinterOutlined,
} from '@ant-design/icons';
import {
    accountingDocumentsApi,
    api,
} from '@/lib/api';
import type { AccountingDocumentDraft } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { amountToWordsKzt } from '@/lib/amountToWords';
import { calendarDate } from '@/lib/ru-date';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';

const { RangePicker } = DatePicker;

interface ActRow {
    date: string;
    doc: string;
    description: string;
    /** «Увеличение долга» в терминах 1С. */
    debit: number;
    /** «Уменьшение долга» в терминах 1С. */
    credit: number;
    balance: number;
    orderNumber: string | null;
    route: string | null;
    driver: string | null;
    invoiceNumber: string | null;
    actNumber: string | null;
}
interface ActData {
    company: { id: string; name: string; bin: string | null };
    counterparty: { id: string; name: string; bin: string | null };
    period: { start: string | null; end: string | null };
    openingBalance: number;
    rows: ActRow[];
    totals: { debit: number; credit: number };
    closingBalance: number;
    generatedAt: string;
}

const fmt = (n: number) => (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function ReconciliationActInner() {
    const router = useRouter();
    const params = useSearchParams();
    const cpId = params.get('cp') || '';

    const [loading, setLoading] = useState(true);
    const [creatingDraft, setCreatingDraft] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [data, setData] = useState<ActData | null>(null);
    const [createdDraft, setCreatedDraft] = useState<AccountingDocumentDraft | null>(null);
    const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([dayjs().startOf('year'), dayjs().endOf('day')]);

    const fetchAct = useCallback(async () => {
        if (!cpId) { setLoading(false); return; }
        setLoading(true);
        try {
            const q: any = {};
            if (range && range[0] && range[1]) {
                // Календарной датой, как и официальный черновик ниже.
                // `toISOString()` отдавал местную полночь по UTC, сервер
                // считал у неё сутки и уносил начало периода на день назад —
                // предпросмотр и черновик расходились и по датам, и по тому,
                // какие операции попадали в акт.
                q.startDate = range[0].format('YYYY-MM-DD');
                q.endDate = range[1].format('YYYY-MM-DD');
            }
            const res = await api.get(`/accounting/reconciliation-act/${cpId}`, { params: q });
            setData(res.data);
        } catch {
            toast.error('Не удалось сформировать акт сверки');
        } finally {
            setLoading(false);
        }
    }, [cpId, range]);

    useEffect(() => { fetchAct(); }, [fetchAct]);

    const handleRangeChange = (value: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
        setCreatedDraft(null);
        setRange(value);
    };

    const createOfficialDraft = async () => {
        if (!range?.[0] || !range?.[1] || !data) {
            toast.warning('Сначала выберите период и дождитесь расчёта');
            return;
        }
        setCreatingDraft(true);
        try {
            const draft = await accountingDocumentsApi.createReconciliationDraft({
                counterpartyId: cpId,
                reportPeriodFrom: range[0].format('YYYY-MM-DD'),
                reportPeriodTo: range[1].format('YYYY-MM-DD'),
                documentDate: range[1].format('YYYY-MM-DD'),
            });
            setCreatedDraft(draft);
            toast.success(`Черновик акта № ${draft.number} создан`);
        } catch {
            toast.error('Не удалось создать официальный черновик акта');
        } finally {
            setCreatingDraft(false);
        }
    };

    const downloadOfficialPdf = async () => {
        if (!createdDraft) return;
        setDownloadingPdf(true);
        try {
            const blob = await accountingDocumentsApi.downloadPdf(createdDraft.id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Акт_сверки_${createdDraft.number}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Не удалось скачать официальный PDF');
        } finally {
            setDownloadingPdf(false);
        }
    };

    if (!cpId) {
        return <div className="lc-page" style={{ maxWidth: 900, margin: '0 auto' }}><Empty description="Контрагент не выбран. Откройте акт сверки из карточки во «Взаиморасчётах»." /></div>;
    }

    const balanceWord = (v: number) => {
        if (v > 0) return `задолженность ${data?.counterparty.name || 'контрагента'} перед ${data?.company.name || 'нами'}`;
        if (v < 0) return `задолженность ${data?.company.name || 'нас'} перед ${data?.counterparty.name || 'контрагентом'}`;
        return 'взаимная задолженность отсутствует';
    };

    return (
        <div className="lc-page recon-wrap" style={{ maxWidth: 1180, margin: '0 auto' }}>
            {/* Панель управления — не печатается */}
            <div className="recon-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/accounting/counterparty-report')}>
                    К взаиморасчётам
                </Button>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CalendarOutlined style={{ color: 'var(--lc-text-ter)' }} />
                    <RangePicker
                        value={range}
                        onChange={(value) => handleRangeChange(value as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                        allowClear={false}
                        format="DD.MM.YYYY"
                        presets={[
                            { label: 'Текущий год', value: [dayjs().startOf('year'), dayjs().endOf('day')] },
                            { label: 'Прошлый год', value: [dayjs().subtract(1, 'year').startOf('year'), dayjs().subtract(1, 'year').endOf('year')] },
                            { label: 'Текущий квартал', value: [dayjs().startOf('quarter'), dayjs().endOf('day')] },
                        ]}
                    />
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <Button icon={<PrinterOutlined />} onClick={() => window.print()} disabled={!data || loading}>
                        Печать предварительной формы
                    </Button>
                    {createdDraft ? (
                        <Button
                            type="primary"
                            icon={<FilePdfOutlined />}
                            loading={downloadingPdf}
                            onClick={downloadOfficialPdf}
                        >
                            Скачать PDF № {createdDraft.number}
                        </Button>
                    ) : (
                        <Button
                            type="primary"
                            icon={<FileAddOutlined />}
                            loading={creatingDraft}
                            disabled={!data || loading}
                            onClick={createOfficialDraft}
                        >
                            Создать официальный черновик
                        </Button>
                    )}
                </div>
            </div>

            {createdDraft && (
                <Alert
                    className="recon-controls"
                    type="success"
                    showIcon
                    message={`Официальный черновик № ${createdDraft.number} создан`}
                    description="Документ сохранён в бухгалтерии, но ещё не проведён. Скачайте PDF и проверьте его перед проведением."
                    style={{ marginBottom: 16, borderRadius: 14 }}
                />
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}><Loader size="large" /></div>
            ) : !data ? (
                <Empty description="Нет данных" />
            ) : (
                <div className="recon-doc lc-card" style={{ padding: 40 }}>
                    <h1 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Акт сверки взаимных расчётов</h1>
                    <p style={{ textAlign: 'center', color: 'var(--lc-text-ter)', margin: '0 0 24px', fontSize: 13 }}>
                        за период {calendarDate(data.period.start) ?? 'начало'} — {calendarDate(data.period.end) ?? 'сегодня'}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 20, fontSize: 13 }}>
                        <div>
                            <div style={{ color: 'var(--lc-text-ter)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Организация</div>
                            <div style={{ fontWeight: 700 }}>{data.company.name}</div>
                            {data.company.bin && <div style={{ color: 'var(--lc-text-sec)' }}>БИН/ИИН: {data.company.bin}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ color: 'var(--lc-text-ter)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Контрагент</div>
                            <div style={{ fontWeight: 700 }}>{data.counterparty.name}</div>
                            {data.counterparty.bin && <div style={{ color: 'var(--lc-text-sec)' }}>БИН/ИИН: {data.counterparty.bin}</div>}
                        </div>
                    </div>

                    <p style={{ fontSize: 12.5, color: 'var(--lc-text-sec)', margin: '0 0 12px' }}>
                        Мы, нижеподписавшиеся, составили настоящий акт о том, что состояние взаимных расчётов по данным
                        <strong> {data.company.name} </strong> следующее:
                    </p>

                    <div className="recon-scroll">
                    <table className="recon-table" style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse', fontSize: 11.5 }}>
                        {/* Колонки — как в акте сверки 1С, чтобы бухгалтер
                            сверял строку не открывая заявку. */}
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', width: 78 }}>Дата</th>
                                <th style={{ textAlign: 'left', width: 96 }}>№ заявки</th>
                                <th style={{ textAlign: 'left' }}>Маршрут / комментарий</th>
                                <th style={{ textAlign: 'left', width: 120 }}>Водитель</th>
                                <th style={{ textAlign: 'left', width: 104 }}>Счёт</th>
                                <th style={{ textAlign: 'left', width: 104 }}>Акт</th>
                                <th style={{ textAlign: 'right', width: 106 }}>Увеличение долга</th>
                                <th style={{ textAlign: 'right', width: 106 }}>Уменьшение долга</th>
                                <th style={{ textAlign: 'right', width: 112 }}>Сальдо</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="recon-saldo">
                                <td colSpan={8}><strong>Сальдо на начало периода</strong></td>
                                <td style={{ textAlign: 'right' }}>
                                    <strong>{data.openingBalance >= 0 ? fmt(data.openingBalance) : `(${fmt(-data.openingBalance)})`}</strong>
                                </td>
                            </tr>
                            {data.rows.length === 0 ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--lc-text-ter)', padding: '14px 0' }}>Операций за период нет</td></tr>
                            ) : data.rows.map((r, i) => (
                                <tr key={i}>
                                    <td>{dayjs(r.date).format('DD.MM.YYYY')}</td>
                                    <td>{r.orderNumber || '—'}</td>
                                    <td>
                                        {r.route || r.doc}
                                        {r.description && (
                                            <span style={{ color: 'var(--lc-text-ter)' }}> · {r.description}</span>
                                        )}
                                    </td>
                                    <td>{r.driver || '—'}</td>
                                    <td>{r.invoiceNumber || '—'}</td>
                                    <td>{r.actNumber || '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{r.debit ? fmt(r.debit) : ''}</td>
                                    <td style={{ textAlign: 'right' }}>{r.credit ? fmt(r.credit) : ''}</td>
                                    <td style={{ textAlign: 'right' }}>{r.balance >= 0 ? fmt(r.balance) : `(${fmt(-r.balance)})`}</td>
                                </tr>
                            ))}
                            <tr className="recon-total">
                                <td colSpan={6}><strong>Обороты за период</strong></td>
                                <td style={{ textAlign: 'right' }}><strong>{fmt(data.totals.debit)}</strong></td>
                                <td style={{ textAlign: 'right' }}><strong>{fmt(data.totals.credit)}</strong></td>
                                <td></td>
                            </tr>
                            <tr className="recon-saldo">
                                <td colSpan={8}><strong>Сальдо на конец периода</strong></td>
                                <td style={{ textAlign: 'right' }}>
                                    <strong>{data.closingBalance >= 0 ? fmt(data.closingBalance) : `(${fmt(-data.closingBalance)})`}</strong>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    </div>

                    <p style={{ fontSize: 13, margin: '18px 0 6px' }}>
                        На {data.period.end ? dayjs(data.period.end).format('DD.MM.YYYY') : dayjs().format('DD.MM.YYYY')} {data.closingBalance === 0 ? '' : <>по данным {data.company.name} </>}
                        <strong>{balanceWord(data.closingBalance)}{data.closingBalance !== 0 ? `: ${fmt(Math.abs(data.closingBalance))} ₸` : ''}</strong>.
                    </p>
                    {data.closingBalance !== 0 && (
                        <p style={{ fontSize: 12.5, margin: '0 0 6px', fontStyle: 'italic' }}>
                            {amountToWordsKzt(Math.abs(data.closingBalance))}.
                        </p>
                    )}
                    <p style={{ fontSize: 11.5, color: 'var(--lc-text-ter)', margin: 0 }}>
                        Скобки означают сальдо в обратную сторону — кредиторскую задолженность.
                    </p>

                    {/* Подписи */}
                    <div className="recon-signs" style={{ display: 'flex', justifyContent: 'space-between', gap: 40, marginTop: 48 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 34 }}>От {data.company.name}</div>
                            <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 11, color: 'var(--lc-text-ter)' }}>подпись, М.П.</div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 34 }}>От {data.counterparty.name}</div>
                            <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 11, color: 'var(--lc-text-ter)' }}>подпись, М.П.</div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .recon-table th {
                    border-bottom: 2px solid #333;
                    padding: 6px 8px;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    color: var(--lc-text-sec);
                }
                .recon-table td {
                    border-bottom: 1px solid var(--lc-border);
                    padding: 5px 8px;
                    font-variant-numeric: tabular-nums;
                }
                .recon-table tr.recon-saldo td { background: var(--lc-hover); }
                .recon-table tr.recon-total td { border-top: 2px solid #333; }
                /* Таблица горизонтально прокручивается на узком экране,
                   но сама страница вбок не едет. */
                .recon-scroll { overflow-x: auto; }
                @media print {
                    /* Девять колонок в портрет не помещаются — 1С печатает
                       акт сверки так же, альбомом. */
                    @page { size: landscape; margin: 12mm; }
                    .recon-scroll { overflow-x: visible !important; }
                    .recon-table { font-size: 10px !important; }
                    .recon-table th, .recon-table td { padding: 3px 5px !important; }
                    .recon-controls, .lc-app-nav, nav, header, .ant-layout-sider, .ant-layout-header { display: none !important; }
                    .recon-doc { box-shadow: none !important; border: none !important; padding: 0 !important; }
                    .recon-wrap { max-width: 100% !important; }
                    body { background: #fff !important; }
                    .recon-table tr.recon-saldo td { background: #f3f3f3 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>
        </div>
    );
}

export default function ReconciliationActPage() {
    return (
        <Suspense fallback={<div style={{ textAlign: 'center', padding: 60 }}><Loader size="large" /></div>}>
            <ReconciliationActInner />
        </Suspense>
    );
}
