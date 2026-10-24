'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, Copy, KeyRound, Loader2, Pause, Play, Plug } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера } from '@/lib/exchange';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
    receiveCounterparties: boolean;
    receivePayments: boolean;
    log: { id: string; operation: string; ok: boolean; message: string | null; createdAt: string }[];
}

interface Secret {
    keyAddress: string;
    login: string;
    password: string;
}

/** Шаги в самой 1С — словами бухгалтера, а не программиста. */
const STEPS = [
    '«Администрирование» → «Синхронизация данных» — поставьте галочку «Синхронизация данных».',
    'Откройте «Настройки синхронизации данных» → «Создать» → «Другая программа».',
    '«Настроить параметры подключения» → «Подключение к другой программе через Интернет».',
    'Вставьте «Адрес для 1С» отсюда — целиком, с ключом. «Пользователь» и «Пароль» можно не заполнять → «Далее» → «Далее» → «Готово».',
    '«Настроить правила отправки и получения данных» → «Записать и закрыть».',
    '«Выполнить начальную выгрузку данных» → «Далее». Дальше — кнопка «Синхронизировать» или расписание в 1С.',
];

type Choice = 'sendActs' | 'receiveCounterparties' | 'receivePayments';

/**
 * Что передавать — решает компания (решение владельца 24.10.2026). По
 * умолчанию включены только акты в 1С. Тексты — что увидит бухгалтер, а не
 * как это устроено.
 */
const CHOICES: { key: Choice; title: string; hint: string; on: string; off: string }[] = [
    {
        key: 'sendActs',
        title: 'Отправлять в 1С акты выполненных работ',
        hint: 'Акты, проведённые в LogiCore после подключения, появятся в 1С документом «Реализация (акт, накладная)».',
        on: 'Акты будут уходить в 1С', off: 'Акты в 1С больше не уходят',
    },
    {
        key: 'receiveCounterparties',
        title: 'Получать из 1С контрагентов',
        hint: 'Новые контрагенты из 1С появятся в справочнике LogiCore. Уже заведённые с тем же БИН — не задвоятся.',
        on: 'Контрагенты из 1С будут приходить', off: 'Контрагенты из 1С больше не принимаются',
    },
    {
        key: 'receivePayments',
        title: 'Получать из 1С оплаты клиентов',
        hint: 'Поступления на счёт и в кассу от клиентов станут платежами в LogiCore и закроют долг по счетам.',
        on: 'Оплаты из 1С будут приходить', off: 'Оплаты из 1С больше не принимаются',
    },
];

/**
 * «Обмен с 1С» (решение владельца 22–23.10.2026).
 *
 * Компания сама подключает свою 1С: включает обмен здесь, получает адрес с
 * ключом и вставляет его в 1С в обычной настройке «Другая программа».
 * Программист 1С не нужен. Адрес с ключом показывается один раз; для 1С,
 * которая просит пользователя и пароль, они выдаются вместе с ним.
 */
export default function OneCPage() {
    const user = useAuthStore((s) => s.user);
    const canManage = user?.role === 'COMPANY_ADMIN' || user?.role === 'FORWARDER';
    const [rows, setRows] = useState<Connection[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [secret, setSecret] = useState<Secret | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

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
    const newPassword = (id: string) => run(async () => setSecret((await api.post<Secret>(`/company/one-c/${id}/password`)).data));
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

    const connection = rows?.[0];

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет · Интеграции</div>
                    <h1 className={styles.title}>Обмен с 1С</h1>
                    <p className={styles.subtitle}>
                        Ваша 1С подключается к LogiCore сама, обычной настройкой «Другая программа» — программист не нужен.
                        Подходит и облачная 1С, и 1С на компьютере в офисе.
                    </p>
                </div>
            </div>

            {failed ? (
                <div className={styles.empty}>Не удалось загрузить — обновите страницу.</div>
            ) : !rows ? (
                <div className="space-y-2 p-4" aria-label="Загрузка">{[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />)}</div>
            ) : !connection ? (
                <section className={styles.card}>
                    <div className={cn(styles.cardBody, 'space-y-3 text-[13px]')}>
                        <p className="m-0">
                            Обмен ещё не включён. После включения здесь появятся адрес, пользователь и пароль — их нужно вписать
                            в вашу 1С.
                        </p>
                        {canManage ? (
                            <Button onClick={create} disabled={busy}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Включить обмен с 1С
                            </Button>
                        ) : (
                            <p className="m-0 text-muted-foreground">Включает руководитель компании.</p>
                        )}
                    </div>
                </section>
            ) : (
                <>
                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <Plug size={14} />
                            <h2 className={styles.cardTitle}>Подключение</h2>
                            <span className={cn(styles.chip, !connection.enabled ? styles.chipNeg : connection.connected ? '' : styles.chipWarn)}>
                                {!connection.enabled ? 'Приостановлен' : connection.connected ? '1С подключена' : 'Ждём подключения 1С'}
                            </span>
                        </div>
                        <div className={cn(styles.cardBody, 'grid gap-4 text-[13px] lg:grid-cols-2')}>
                            <div className="space-y-2">
                                <div className="text-muted-foreground">
                                    Адрес для 1С с ключом показывается один раз, когда его выдают. Потеряли — нажмите «Новый адрес»:
                                    старый перестанет работать, новый надо будет вставить в 1С.
                                </div>
                                {connection.connected && (
                                    <div>
                                        Подключена: <b>{connection.peerName}</b>
                                        {connection.formatVersion && <span className="text-muted-foreground"> · формат {connection.formatVersion}</span>}
                                        {connection.setupAt && <span className="text-muted-foreground"> · с {dayjs(connection.setupAt).format('DD.MM.YYYY HH:mm')}</span>}
                                    </div>
                                )}
                                {connection.lastSeenAt && (
                                    <div className="text-muted-foreground">Последнее обращение 1С: {dayjs(connection.lastSeenAt).format('DD.MM.YYYY HH:mm')}</div>
                                )}
                                {canManage && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <Button variant="outline" size="sm" onClick={() => newPassword(connection.id)} disabled={busy}>
                                            <KeyRound className="h-3.5 w-3.5" /> Новый адрес
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => toggle(connection)} disabled={busy}>
                                            {connection.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                            {connection.enabled ? 'Приостановить' : 'Возобновить'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="mb-1.5 font-medium">Что сделать в 1С</div>
                                <ol className="m-0 space-y-1.5 pl-5">
                                    {STEPS.map((s) => <li key={s}>{s}</li>)}
                                </ol>
                            </div>
                        </div>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <h2 className={styles.cardTitle}>Что передавать</h2>
                        </div>
                        <div className={cn(styles.cardBody, 'space-y-3 text-[13px]')}>
                            {CHOICES.map((choice) => (
                                <label key={choice.key} className="flex cursor-pointer items-start gap-3">
                                    <Checkbox
                                        className="mt-0.5"
                                        checked={connection[choice.key]}
                                        disabled={!canManage || busy}
                                        onCheckedChange={(v) => choose(connection, choice.key, v === true)}
                                    />
                                    <span className="space-y-0.5">
                                        <span className="block font-medium">{choice.title}</span>
                                        <span className="block text-muted-foreground">{choice.hint}</span>
                                    </span>
                                </label>
                            ))}
                            <p className="m-0 text-muted-foreground">
                                {canManage
                                    ? 'Изменения начнут действовать со следующей синхронизации. Что выключено, 1С не присылает вовсе.'
                                    : 'Что передавать, выбирает руководитель компании.'}
                            </p>
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
                            <Table className="border-collapse text-[13px]">
                                <TableHeader>
                                    <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                        <TableHead className="h-9 w-40">Когда</TableHead>
                                        <TableHead className="h-9">Что</TableHead>
                                        <TableHead className="h-9 w-28">Итог</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {connection.log.map((l) => (
                                        <TableRow key={l.id} className="border-0 border-b border-solid border-border">
                                            <TableCell className="py-2 text-muted-foreground">{dayjs(l.createdAt).format('DD.MM HH:mm:ss')}</TableCell>
                                            <TableCell className="py-2">{l.message ?? l.operation}</TableCell>
                                            <TableCell className="py-2">
                                                <span className={cn(styles.chip, !l.ok && styles.chipNeg)}>{l.ok ? 'Готово' : 'Ошибка'}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </section>
                </>
            )}

            <Dialog open={!!secret} onOpenChange={(o) => { if (!o) setSecret(null); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">Данные для вашей 1С</DialogTitle>
                    </DialogHeader>
                    {secret && (
                        // min-w-0: длинный адрес с ключом не должен распирать окно — он обрезается в поле.
                        <div className="min-w-0 space-y-3 text-[13px]">
                            <Field label="Адрес для 1С" value={secret.keyAddress} onCopy={() => copy('s-address', secret.keyAddress)} copied={copied === 's-address'} />
                            <p className="m-0">
                                Вставьте его в 1С в поле «Адрес программы» целиком. «Пользователь» и «Пароль» в 1С можно не заполнять.
                            </p>
                            <details className="rounded-lg border border-solid border-border px-3 py-2">
                                <summary className="cursor-pointer text-muted-foreground">Если 1С всё же просит пользователя и пароль</summary>
                                <div className="mt-2 space-y-2">
                                    <Field label="Пользователь" value={secret.login} onCopy={() => copy('s-login', secret.login)} copied={copied === 's-login'} />
                                    <Field label="Пароль" value={secret.password} onCopy={() => copy('s-password', secret.password)} copied={copied === 's-password'} />
                                </div>
                            </details>
                            <p className="m-0 text-muted-foreground">
                                Адрес показывается один раз — после закрытия окна его не увидит никто, даже вы. Вставьте его в 1С сейчас.
                            </p>
                            <div className="flex justify-end">
                                <Button onClick={() => setSecret(null)}>Готово</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Field({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-solid border-border bg-muted/40 px-2.5 py-1.5 text-[13px]">{value}</code>
                <Button variant="outline" size="sm" onClick={onCopy} aria-label={`Скопировать: ${label}`}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
            </div>
        </div>
    );
}
