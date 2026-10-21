'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { FileText, Paperclip } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import styles from '@/components/nova/nova.module.css';

interface SentAttorney {
    id: string;
    sentAt: string;
    sentBy: string | null;
    orderId: string | null;
    orderNumber: string | null;
    emails: string[];
    driver: string | null;
    vehicle: string | null;
    attachments: string[];
}

/**
 * Журнал отправленных доверенностей (задачи шефа, D4): все отправки за
 * период — когда, по какой заявке, на какого водителя и машину, кому ушло
 * письмо и что к нему приложили. Отправки пишутся с 21.10.2026.
 */
export default function AttorneysJournalPage() {
    const [from, setFrom] = useState(() => dayjs().startOf('month').format('YYYY-MM-DD'));
    const [to, setTo] = useState(() => dayjs().format('YYYY-MM-DD'));
    const [rows, setRows] = useState<SentAttorney[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        setRows(null);
        setFailed(false);
        api.get<SentAttorney[]>('/orders/attorneys/sent', { params: { from, to } })
            .then((r) => { if (alive) setRows(r.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [from, to]);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Заявки</div>
                    <h1 className={styles.title}>Доверенности</h1>
                    <p className={styles.subtitle}>Журнал отправленных доверенностей: кому, когда, по какой заявке и с какими файлами.</p>
                </div>
            </div>

            <div className="mb-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-muted-foreground">С</span>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 text-[13px]" />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-muted-foreground">По</span>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 text-[13px]" />
                </label>
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <FileText size={14} />
                    <h2 className={styles.cardTitle}>Отправленные доверенности</h2>
                    {rows && <span className={styles.cardCount}>{rows.length}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить журнал — обновите страницу.</div>
                ) : !rows ? (
                    <div className="space-y-2 p-4" aria-label="Загрузка">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />)}</div>
                ) : rows.length === 0 ? (
                    <div className={styles.empty}>За этот период доверенности не отправляли. Журнал ведётся с 21.10.2026.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table className="border-collapse text-[13px]">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9">Когда</TableHead>
                                    <TableHead className="h-9">Заявка</TableHead>
                                    <TableHead className="h-9">Водитель и машина</TableHead>
                                    <TableHead className="h-9">Кому ушло</TableHead>
                                    <TableHead className="h-9">Вложения</TableHead>
                                    <TableHead className="h-9">Отправил</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r) => (
                                    <TableRow key={r.id} className="border-0 border-b border-solid border-border align-top">
                                        <TableCell className="whitespace-nowrap py-2.5 tabular-nums">{dayjs(r.sentAt).format('DD.MM.YYYY HH:mm')}</TableCell>
                                        <TableCell className="py-2.5">
                                            {r.orderId ? <Link href={`/company/orders/${r.orderId}`} className="lc-ordernum">{r.orderNumber ?? 'заявка'}</Link> : (r.orderNumber ?? '—')}
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            <div>{r.driver ?? '—'}</div>
                                            {r.vehicle && <div className="text-[12px] text-muted-foreground">{r.vehicle}</div>}
                                        </TableCell>
                                        <TableCell className="py-2.5 text-[12.5px]">{r.emails.join(', ')}</TableCell>
                                        <TableCell className="py-2.5 text-[12.5px]">
                                            {r.attachments.length ? (
                                                <span className="inline-flex items-start gap-1"><Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{r.attachments.join(', ')}</span>
                                            ) : <span className="text-muted-foreground">только доверенность</span>}
                                        </TableCell>
                                        <TableCell className="py-2.5 text-muted-foreground">{r.sentBy ?? '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>
        </div>
    );
}
