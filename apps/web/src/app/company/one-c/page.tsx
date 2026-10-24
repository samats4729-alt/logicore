'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { AlertCircle, ArrowRight, Check, CheckCircle2, Copy, KeyRound, Loader2, Pause, Play, Plug, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера } from '@/lib/exchange';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { OneCGuide } from '@/components/onec/OneCGuide';
import { cn } from '@/lib/utils';
import styles from '@/components/nova/nova.module.css';

interface Connection {
    id: string;
    address: string;
    login: string;
    enabled: boolean;
    connected: boolean;
    peerName: string | null;
    formatVersion: string | null;
    setupAt: string | null;
    lastSeenAt: string | null;
    createdAt: string;
    sendActs: boolean;
    sendCarrierActs: boolean;
    sendContracts: boolean;
    receiveCounterparties: boolean;
    receivePayments: boolean;
    receiveCarrierPayments: boolean;
    log: { id: string; operation: string; ok: boolean; message: string | null; createdAt: string }[];
}

interface Secret {
    keyAddress: string;
    login: string;
    password: string;
}

type Choice = 'sendActs' | 'sendCarrierActs' | 'sendContracts' | 'receiveCounterparties' | 'receivePayments' | 'receiveCarrierPayments';

/**
 * Какие данные ходят — решает компания (решение владельца 24.10.2026). По
 * умолчанию включены только акты в 1С. Сгруппировано по направлению:
 * отдельно что уходит в 1С, отдельно что приходит из неё (просьба владельца).
 * Тексты — что увидит бухгалтер, а не как это устроено.
 */
const CHOICES: { key: Choice; direction: 'to1c' | 'from1c'; title: string; hint: string; on: string; off: string }[] = [
    {
        key: 'sendActs',
        direction: 'to1c',
        title: 'Акты выполненных работ',
        hint: 'Проведённый в LogiCore акт сам появится в 1С.',
        on: 'Акты будут уходить в 1С', off: 'Акты в 1С больше не уходят',
    },
    {
        key: 'sendCarrierActs',
        direction: 'to1c',
        title: 'Акты перевозчиков',
        hint: 'Расход на перевозку сам появится в 1С — вбивать его руками не нужно.',
        on: 'Акты перевозчиков будут уходить в 1С', off: 'Акты перевозчиков в 1С больше не уходят',
    },
    {
        key: 'sendContracts',
        direction: 'to1c',
        title: 'Договоры',
        hint: 'Акт ляжет в 1С на свой договор, а не на «Основной».',
        on: 'Договоры будут уходить в 1С', off: 'Договоры в 1С больше не уходят',
    },
    {
        key: 'receiveCounterparties',
        direction: 'from1c',
        title: 'Контрагенты',
        hint: 'Новые попадут в справочник, дублей по БИН не будет.',
        on: 'Контрагенты из 1С будут приходить', off: 'Контрагенты из 1С больше не принимаются',
    },
    {
        key: 'receivePayments',
        direction: 'from1c',
        title: 'Оплаты от клиентов',
        hint: 'Станут платежами в LogiCore и закроют долг по счетам.',
        on: 'Оплаты из 1С будут приходить', off: 'Оплаты из 1С больше не принимаются',
    },
    {
        key: 'receiveCarrierPayments',
        direction: 'from1c',
        title: 'Оплаты перевозчикам',
        hint: 'Счёт перевозчика сам станет оплаченным, когда бухгалтер заплатит из 1С.',
        on: 'Оплаты перевозчикам из 1С будут приходить', off: 'Оплаты перевозчикам из 1С больше не принимаются',
    },
];

const DIRECTIONS = [
    { key: 'to1c', title: 'Отправляем в 1С', from: 'LogiCore', to: '1С' },
    { key: 'from1c', title: 'Принимаем из 1С', from: '1С', to: 'LogiCore' },
] as const;

/** «5 минут назад» — для последнего обмена. */
function ago(iso: string) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    if (min < 24 * 60) return `${Math.floor(min / 60)} ч назад`;
    return dayjs(iso).format('DD.MM.YYYY HH:mm');
}

/**
 * «Обмен с 1С» (решение владельца 22–24.10.2026).
 *
 * Три состояния, по одному действию в каждом: обмен не включён — «Подключить
 * 1С»; включён, но 1С ещё не пришла — адрес и мини-видео, как вставить его
 * в 1С; 1С подключена — настройки обмена и журнал. Программист 1С не нужен.
 * Адрес с ключом показывается один раз — потерян, выдаём новый.
 */
export default function OneCPage() {
    const user = useAuthStore((s) => s.user);
    const canManage = user?.role === 'COMPANY_ADMIN' || user?.role === 'FORWARDER';
    const [rows, setRows] = useState<Connection[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [secret, setSecret] = useState<Secret | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [showGuide, setShowGuide] = useState(false);
    const [allLog, setAllLog] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get<Connection[]>('/company/one-c');
            setRows(data);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const connection = rows?.[0];
    const waiting = !!connection && connection.enabled && !connection.connected;

    // Пока ждём 1С — заглядываем раз в 8 секунд: подключилась — страница сама это покажет.
    useEffect(() => {
        if (!waiting) return;
        const timer = setInterval(() => { void load(); }, 8000);
        return () => clearInterval(timer);
    }, [waiting, load]);

    const [wasWaiting, setWasWaiting] = useState(false);
    useEffect(() => {
        if (waiting) setWasWaiting(true);
        else if (wasWaiting && connection?.connected) {
            setWasWaiting(false);
            setSecret(null);
            toast.success('1С подключилась к LogiCore');
        }
    }, [waiting, wasWaiting, connection?.connected]);

    const run = async (fn: () => Promise<unknown>, done?: string) => {
        setBusy(true);
        try {
            await fn();
            if (done) toast.success(done);
            await load();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить'));
        } finally {
            setBusy(false);
        }
    };

    const create = () => run(async () => setSecret((await api.post<Secret>('/company/one-c')).data));
    const newAddress = (id: string) => run(async () => setSecret((await api.post<Secret>(`/company/one-c/${id}/password`)).data));
    const toggle = (c: Connection) => run(() => api.patch(`/company/one-c/${c.id}`, { enabled: !c.enabled }),
        c.enabled ? 'Обмен с 1С приостановлен' : 'Обмен с 1С возобновлён');

    const choose = (c: Connection, key: Choice, value: boolean) => {
        const choice = CHOICES.find((x) => x.key === key)!;
        return run(() => api.patch(`/company/one-c/${c.id}`, { [key]: value }), value ? choice.on : choice.off);
    };

    const copy = async (key: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(key);
            setTimeout(() => setCopied(null), 1500);
        } catch {
            toast.error('Не удалось скопировать — выделите текст вручную');
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет · Интеграции</div>
                    <h1 className={styles.title}>Обмен с 1С</h1>
                    <p className={styles.subtitle}>Акты из LogiCore сами появляются в вашей 1С — облачной или на компьютере.</p>
                </div>
            </div>

            {failed ? (
                <div className={styles.empty}>Не удалось загрузить — обновите страницу.</div>
            ) : !rows ? (
                <div className="space-y-2 p-4" aria-label="Загрузка">{[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />)}</div>
            ) : !connection ? (
                // ===== 1. Обмен не включён =====
                <section className={styles.card}>
                    <div className={cn(styles.cardBody, 'space-y-4')}>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                { icon: Plug, title: 'Подключите', text: 'Одна кнопка ниже' },
                                { icon: Copy, title: 'Вставьте адрес в 1С', text: 'Пять минут по видео' },
                                { icon: CheckCircle2, title: 'Готово', text: 'Акты сами появятся в 1С' },
                            ].map((s, i) => (
                                <div key={s.title} className="flex items-start gap-3 rounded-xl bg-muted/40 p-3">
                                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background text-[13px] font-semibold shadow-soft">{i + 1}</div>
                                    <div>
                                        <div className="flex items-center gap-1.5 text-[13px] font-semibold"><s.icon className="h-3.5 w-3.5" />{s.title}</div>
                                        <div className="text-[12px] text-muted-foreground">{s.text}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {canManage ? (
                            <Button className="h-9" onClick={create} disabled={busy}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Подключить 1С
                            </Button>
                        ) : (
                            <p className="m-0 text-[13px] text-muted-foreground">Подключает руководитель компании.</p>
                        )}
                    </div>
                </section>
            ) : !connection.connected ? (
                // ===== 2. Подключаем: адрес + мини-видео =====
                <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,752px)]">
                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <Plug size={14} />
                            <h2 className={styles.cardTitle}>Подключение 1С</h2>
                            <span className={cn(styles.chip, connection.enabled ? styles.chipWarn : styles.chipNeg)}>
                                {connection.enabled ? 'Ждём 1С' : 'Приостановлен'}
                            </span>
                        </div>
                        <ol className={cn(styles.cardBody, 'm-0 list-none space-y-4 text-[13px]')}>
                            <Step n={1} title="Скопируйте адрес">
                                {secret ? (
                                    <div className="space-y-1.5">
                                        <AddressField value={secret.keyAddress} copied={copied === 'address'} onCopy={() => copy('address', secret.keyAddress)} />
                                        <p className="m-0 text-[12px] text-muted-foreground">Показывается один раз — не закрывайте страницу, пока не вставите в 1С.</p>
                                    </div>
                                ) : canManage ? (
                                    <div className="space-y-1.5">
                                        <p className="m-0 text-[12px] text-muted-foreground">Адрес показывался один раз. Не сохранили — выдайте новый.</p>
                                        <Button size="sm" variant="outline" onClick={() => newAddress(connection.id)} disabled={busy}>
                                            <KeyRound className="h-3.5 w-3.5" /> Показать новый адрес
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="m-0 text-[12px] text-muted-foreground">Адрес выдаёт руководитель компании.</p>
                                )}
                            </Step>
                            <Step n={2} title="Вставьте его в 1С">
                                <p className="m-0 text-[12px] text-muted-foreground">Смотрите видео — три коротких главы. Поля «Пользователь» и «Пароль» в 1С оставьте пустыми.</p>
                            </Step>
                            <Step n={3} title="Подождите пару секунд">
                                <p className="m-0 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                                    {connection.enabled && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    Как только 1С подключится, страница обновится сама.
                                </p>
                            </Step>
                        </ol>
                        {secret && (
                            <details className="mx-4 mb-4 rounded-lg border border-solid border-border px-3 py-2 text-[12px]">
                                <summary className="cursor-pointer text-muted-foreground">Если 1С попросит пароль</summary>
                                <div className="mt-2 space-y-2">
                                    {/* Настольная 1С спрашивает его на первой выгрузке, если не отмечено «Запомнить пароль». */}
                                    <p className="m-0 text-muted-foreground">Так бывает в 1С на компьютере на шаге первой выгрузки. Вставьте:</p>
                                    <div className="space-y-1">
                                        <div className="text-muted-foreground">Пароль</div>
                                        <AddressField value={secret.password} copied={copied === 'password'} onCopy={() => copy('password', secret.password)} />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-muted-foreground">Пользователь — если 1С спросит и его</div>
                                        <AddressField value={secret.login} copied={copied === 'login'} onCopy={() => copy('login', secret.login)} />
                                    </div>
                                </div>
                            </details>
                        )}
                    </section>
                    <section className={styles.card}>
                        <div className={styles.cardBody}>
                            <OneCGuide />
                        </div>
                    </section>
                </div>
            ) : (
                // ===== 3. 1С подключена =====
                <>
                    <section className={styles.card}>
                        <div className={cn(styles.cardBody, 'flex flex-wrap items-center gap-4')}>
                            <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', connection.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                                {connection.enabled ? <CheckCircle2 className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[15px] font-semibold">{connection.enabled ? '1С подключена' : 'Обмен приостановлен'}</div>
                                <div className="truncate text-[12px] text-muted-foreground">
                                    {connection.peerName}
                                    {connection.lastSeenAt && ` · последний обмен ${ago(connection.lastSeenAt)}`}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => setShowGuide((v) => !v)}>
                                    <PlayCircle className="h-3.5 w-3.5" /> Инструкция
                                </Button>
                                {canManage && (
                                    <>
                                        <Button variant="outline" size="sm" onClick={() => newAddress(connection.id)} disabled={busy}>
                                            <KeyRound className="h-3.5 w-3.5" /> Новый адрес
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => toggle(connection)} disabled={busy}>
                                            {connection.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                            {connection.enabled ? 'Приостановить' : 'Возобновить'}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                        {secret && (
                            <div className="mx-4 mb-4 space-y-1.5 rounded-xl bg-muted/40 p-3 text-[12px]">
                                <div className="font-medium">Новый адрес — вставьте его в 1С вместо старого</div>
                                <AddressField value={secret.keyAddress} copied={copied === 'address'} onCopy={() => copy('address', secret.keyAddress)} />
                                <div className="text-muted-foreground">
                                    В 1С: «Настройки синхронизации данных» → строка LogiCore → «Настроить параметры подключения». Старый адрес уже не работает.
                                </div>
                            </div>
                        )}
                    </section>

                    {showGuide && (
                        <section className={cn(styles.card, 'max-w-[752px]')}>
                            <div className={styles.cardBody}><OneCGuide /></div>
                        </section>
                    )}

                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <h2 className={styles.cardTitle}>Настройки обмена</h2>
                        </div>
                        <div className={cn(styles.cardBody, 'grid gap-3 text-[13px] md:grid-cols-2')}>
                            {DIRECTIONS.map((dir) => (
                                <div key={dir.key} className="rounded-xl bg-muted/40 p-3">
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className="font-semibold">{dir.title}</span>
                                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                                            {dir.from} <ArrowRight className="h-3 w-3" aria-label="в" /> {dir.to}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {CHOICES.filter((c) => c.direction === dir.key).map((choice) => (
                                            <label key={choice.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-background px-3 py-2.5">
                                                <Checkbox
                                                    className="mt-0.5"
                                                    checked={connection[choice.key]}
                                                    disabled={!canManage || busy}
                                                    onCheckedChange={(v) => choose(connection, choice.key, v === true)}
                                                />
                                                <span>
                                                    <span className="block font-medium">{choice.title}</span>
                                                    <span className="block text-[12px] text-muted-foreground">{choice.hint}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <h2 className={styles.cardTitle}>Журнал обмена</h2>
                            <span className={styles.cardCount}>{connection.log.length}</span>
                        </div>
                        {connection.log.length === 0 ? (
                            <div className={styles.empty}>Пока пусто — здесь появится всё, что 1С присылала и получала.</div>
                        ) : (
                            <ul className="m-0 list-none p-0 text-[13px]">
                                {(allLog ? connection.log : connection.log.slice(0, 5)).map((l) => (
                                    <li key={l.id} className="flex items-start gap-2.5 border-0 border-t border-solid border-border px-4 py-2.5">
                                        {l.ok
                                            ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Готово" />
                                            : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Ошибка" />}
                                        <span className="min-w-0 flex-1">{l.message ?? l.operation}</span>
                                        <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{dayjs(l.createdAt).format('DD.MM HH:mm')}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {connection.log.length > 5 && (
                            <div className="border-0 border-t border-solid border-border px-4 py-2">
                                <Button variant="ghost" size="sm" onClick={() => setAllLog((v) => !v)}>
                                    {allLog ? 'Свернуть' : `Показать всё (${connection.log.length})`}
                                </Button>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
    return (
        <li className="flex gap-3">
            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">{n}</div>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="font-semibold">{title}</div>
                {children}
            </div>
        </li>
    );
}

function AddressField({ value, onCopy, copied }: { value: string; onCopy: () => void; copied: boolean }) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-solid border-border bg-muted/40 px-2.5 py-1.5 text-[12px]">{value}</code>
            <Button size="sm" onClick={onCopy} aria-label="Скопировать">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Скопировано' : 'Скопировать'}
            </Button>
        </div>
    );
}
