'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, Percent, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import styles from '@/components/nova/nova.module.css';

interface Row {
    id: string;
    name: string;
    bin: string | null;
    isPark: boolean;
    exchangeAccess: boolean;
    isActive: boolean;
    _count: { exchangeDrivers: number };
}

/**
 * Биржа в админке: кому она открыта и кто из компаний работает парком.
 *
 * Доступ: пока биржу проверяют, её видят только отмеченные здесь компании и
 * водители их парков (решение владельца от 07.10.2026). Остальные не видят
 * ни раздела, ни кнопки «Выставить на биржу».
 *
 * Парк арендует машину с экипажем у водителей без ИП, чтобы перевозка шла
 * законно. Отметку ставит только владелец платформы (решение от 04.10.2026):
 * чужая компания не может сама начать набирать водителей.
 */
export default function AdminParksPage() {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<Row[] | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const timer = setTimeout(() => {
            api.get('/exchange/admin/companies', { params: { q: q || undefined } })
                .then((r) => { if (alive) { setRows(r.data); setFailed(null); } })
                .catch((e) => {
                    if (!alive) return;
                    setFailed(e?.response?.status === 404
                        ? 'Биржа на этом сервере выключена.'
                        : 'Не удалось загрузить компании. Обновите страницу.');
                });
        }, 250);
        return () => { alive = false; clearTimeout(timer); };
    }, [q]);

    const toggleAccess = async (row: Row) => {
        setBusy(`${row.id}:access`);
        try {
            const { data } = await api.put(`/exchange/admin/companies/${row.id}/access`, { exchangeAccess: !row.exchangeAccess });
            setRows((list) => list?.map((r) => (r.id === row.id ? { ...r, exchangeAccess: data.exchangeAccess } : r)) ?? null);
            if (data.exchangeAccess) toast.success(`${row.name} видит биржу`);
            else toast.success(row.isPark
                ? `${row.name} больше не видит биржу — кабинет парка закрыт, водители его не видят`
                : `${row.name} больше не видит биржу`);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить'));
        } finally {
            setBusy(null);
        }
    };

    const toggle = async (row: Row) => {
        setBusy(`${row.id}:park`);
        try {
            const { data } = await api.put(`/exchange/admin/companies/${row.id}/park`, { isPark: !row.isPark });
            // «Сделать парком» открывает и биржу — сервер вернёт обе отметки.
            setRows((list) => list?.map((r) => (r.id === row.id ? { ...r, isPark: data.isPark, exchangeAccess: data.exchangeAccess } : r)) ?? null);
            toast.success(data.isPark
                ? `${row.name} теперь парк. Кабинет парка появится у компании, когда она обновит страницу`
                : `${row.name} больше не парк`);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Биржа</div>
                    <h1 className={styles.title}>Доступ и парки</h1>
                    <p className={styles.subtitle}>
                        Пока биржу проверяют, её видят только компании с отметкой «Биржа открыта» и водители их парков. Остальные не видят ни
                        раздела, ни кнопки «Выставить на биржу». Сняли отметку — заявки компании сразу пропадают с ленты.
                    </p>
                    <p className={styles.subtitle}>
                        Парки — компании-посредники: через них работают водители без ИП. Парк регистрируется на платформе как организация, а здесь вы
                        подтверждаете его как парк — биржа при этом открывается сама: без неё парк не работает. После этого у него свой кабинет — водители, их рейсы и приглашение; заявок, биржи и денег
                        перевозчика у парка нет: он сам не возит.
                    </p>
                </div>
            </div>

            <PlatformFeeCard />

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Building2 size={14} />
                    <h2 className={styles.cardTitle}>Компании платформы</h2>
                    <div className="relative ml-auto w-full max-w-[280px]">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или БИН" aria-label="Поиск компании" className="h-8 pl-8 text-[13px]" />
                    </div>
                </div>
                {failed ? (
                    <div className={styles.empty}>{failed}</div>
                ) : !rows ? (
                    <div className="h-40 animate-pulse" />
                ) : rows.length === 0 ? (
                    <div className={styles.empty}>Ничего не нашлось.</div>
                ) : (
                    <Table className="border-collapse text-[13px]">
                        <TableHeader>
                            <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Компания</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">БИН</TableHead>
                                <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Водителей</TableHead>
                                <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Биржа</TableHead>
                                <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Парк</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((r) => (
                                <TableRow key={r.id} className="border-0 border-b border-solid border-border">
                                    <TableCell className="py-2.5 font-medium">
                                        {r.name}
                                        {!r.isActive && <span className={`${styles.chip} ml-2`}>отключена</span>}
                                        {/* Парк без биржи — пустая отметка: кабинета парка нет, водители его не видят. */}
                                        {r.isPark && !r.exchangeAccess && (
                                            <div className="mt-0.5 text-[12px] font-normal text-destructive">Кабинет парка закрыт — откройте биржу</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="tabular-nums text-muted-foreground">{r.bin || '—'}</TableCell>
                                    <TableCell className="text-right tabular-nums">{r._count.exchangeDrivers || '—'}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            variant={r.exchangeAccess ? 'default' : 'outline'}
                                            onClick={() => toggleAccess(r)}
                                            disabled={busy === `${r.id}:access`}
                                            aria-label={r.exchangeAccess ? `Закрыть биржу: ${r.name}` : `Открыть биржу: ${r.name}`}
                                        >
                                            {busy === `${r.id}:access` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {r.exchangeAccess ? 'Биржа открыта' : 'Открыть биржу'}
                                        </Button>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            variant={r.isPark ? 'default' : 'outline'}
                                            onClick={() => toggle(r)}
                                            disabled={busy === `${r.id}:park`}
                                            aria-label={r.isPark ? `Снять отметку «парк»: ${r.name}` : `Сделать парком: ${r.name}`}
                                        >
                                            {busy === `${r.id}:park` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {r.isPark ? 'Парк' : 'Сделать парком'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </section>
        </div>
    );
}

/**
 * Комиссия LogiCore с рейса водителя парка (решение владельца 12.10.2026):
 * досчитывается сверху к цене для компании вместе с налогами и долей парка.
 * Меняется здесь; действует на новые отклики — прошлые рейсы посчитаны.
 */
function PlatformFeeCard() {
    const [value, setValue] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/exchange/admin/platform-fee').then((r) => setValue(String(r.data.platformPct))).catch(() => setValue(null));
    }, []);

    const save = async () => {
        const pct = Number(String(value).replace(',', '.'));
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast.error('Комиссия — число от 0 до 100'); return; }
        setSaving(true);
        try {
            const { data } = await api.put('/exchange/admin/platform-fee', { platformPct: pct });
            setValue(String(data.platformPct));
            toast.success(`Комиссия LogiCore — ${data.platformPct}%: для новых откликов водителей парков`);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить'));
        } finally {
            setSaving(false);
        }
    };

    if (value == null) return null;
    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                <Percent size={14} />
                <h2 className={styles.cardTitle}>Комиссия LogiCore</h2>
            </div>
            <div className={`${styles.cardBody} flex flex-wrap items-end gap-3`}>
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-muted-foreground">С рейса водителя парка, %</span>
                    <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label="Комиссия LogiCore, %" className="h-9 w-28 text-[13px] tabular-nums" />
                </label>
                <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить</Button>
                <p className="m-0 basis-full text-[12px] text-muted-foreground">
                    Досчитывается сверху к цене для компании вместе с налогами водителя и долей парка. Действует на новые отклики.
                </p>
            </div>
        </section>
    );
}
