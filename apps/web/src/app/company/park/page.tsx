'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, MessageCircle, RefreshCw, Route, UserCheck, UserPlus, UsersRound, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { ParkOverview, ссылкаПриглашения, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import styles from '@/components/nova/nova.module.css';

/**
 * Кабинет парка — главная.
 *
 * Парк не возит сам: через него работают водители без ИП. Его работа —
 * проверить анкеты, видеть, кто сейчас в рейсе, и сколько заработали
 * водители. Сверху то, что ждёт действия: анкеты на проверке. Ниже —
 * приглашение: ссылку отправляют водителю в WhatsApp.
 */
export default function ParkHome() {
    const router = useRouter();
    const [data, setData] = useState<ParkOverview | null>(null);
    const [failed, setFailed] = useState(false);
    const [renewOpen, setRenewOpen] = useState(false);
    const [renewing, setRenewing] = useState(false);

    useEffect(() => {
        api.get('/exchange/park/overview').then((r) => setData(r.data)).catch(() => setFailed(true));
    }, []);

    const link = data ? ссылкаПриглашения(data.inviteCode) : '';
    const message = data
        ? `Здравствуйте! Приглашаем работать с нами на бирже LogiCore. Установите приложение «LogiCore Водитель» и откройте ссылку: ${link} — или введите код ${data.inviteCode} в анкете.`
        : '';

    const copy = async (text: string, what: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${what} скопирован${what === 'Код' ? '' : 'а'}`);
        } catch {
            toast.error('Не удалось скопировать — выделите и скопируйте вручную');
        }
    };

    const renew = async () => {
        setRenewing(true);
        try {
            const { data: r } = await api.post('/exchange/park/invite/regenerate');
            setData((d) => (d ? { ...d, inviteCode: r.inviteCode } : d));
            toast.success('Новый код готов — старая ссылка больше не работает');
            setRenewOpen(false);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сменить код'));
        } finally {
            setRenewing(false);
        }
    };

    if (failed) {
        return (
            <div className={styles.page}>
                <div className={styles.card}><div className={styles.empty}>Не удалось загрузить кабинет парка — обновите страницу.</div></div>
            </div>
        );
    }

    const tiles = data ? [
        { icon: UserCheck, label: 'Анкеты ждут проверки', value: String(data.pendingDrivers), hint: data.pendingDrivers ? 'Проверьте документы и позвоните водителю' : 'Новых анкет нет', href: '/company/park/drivers', accent: data.pendingDrivers > 0 },
        { icon: UsersRound, label: 'Водителей работает', value: String(data.approvedDrivers), hint: 'Допущены к бирже', href: '/company/park/drivers?status=approved', accent: false },
        { icon: Route, label: 'Сейчас в рейсе', value: String(data.activeTrips), hint: 'Рейсы водителей парка', href: '/company/park/trips', accent: false },
        { icon: Wallet, label: 'Довезли в этом месяце', value: moneyShort(data.monthSum), hint: `рейсов: ${data.monthTrips}`, href: '/company/park/trips?status=done', accent: false },
    ] : [];

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Парк</div>
                    <h1 className={styles.title}>Кабинет парка</h1>
                    <p className={styles.subtitle}>
                        Через ваш парк на бирже работают водители без ИП. Здесь — их анкеты, рейсы и приглашение новых водителей.
                    </p>
                </div>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {!data
                    ? [0, 1, 2, 3].map((i) => <div key={i} className={`${styles.card} h-28 animate-pulse`} style={{ marginBottom: 0 }} />)
                    : tiles.map((t) => (
                        <button
                            key={t.label}
                            type="button"
                            onClick={() => router.push(t.href)}
                            className={`${styles.card} cursor-pointer text-left [font-family:inherit] ${t.accent ? 'ring-2 ring-[var(--nova-accent)]' : ''}`}
                            style={{ marginBottom: 0 }}
                        >
                            <div className={styles.cardBody}>
                                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><t.icon className="h-3.5 w-3.5" /> {t.label}</div>
                                <div className="mt-1 text-[24px] font-bold leading-tight tabular-nums">{t.value}</div>
                                <div className="mt-1 text-[12px] text-muted-foreground">{t.hint}</div>
                            </div>
                        </button>
                    ))}
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <UserPlus size={14} />
                    <h2 className={styles.cardTitle}>Пригласить водителя</h2>
                </div>
                <div className={`${styles.cardBody} grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]`}>
                    <div className="space-y-3 text-[13px]">
                        <p className="m-0 text-muted-foreground">
                            Отправьте водителю ссылку. Он установит приложение «LogiCore Водитель», войдёт через Google — и анкета
                            сразу будет привязана к вашему парку. Дальше как обычно: документы, договор, ваша проверка.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <code className="max-w-full truncate rounded-lg bg-muted/60 px-2.5 py-1.5 text-[12px]">{link || '…'}</code>
                            <Button variant="outline" size="sm" disabled={!data} onClick={() => copy(link, 'Ссылка')}>
                                <Copy className="h-3.5 w-3.5" /> Скопировать
                            </Button>
                            <a
                                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-disabled={!data}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-foreground px-3 text-[12px] font-medium text-background no-underline hover:opacity-90"
                            >
                                <MessageCircle className="h-3.5 w-3.5" /> Отправить в WhatsApp
                            </a>
                        </div>
                    </div>
                    <div className="rounded-xl border border-solid border-border p-3 text-center">
                        <div className="text-[12px] text-muted-foreground">Код парка — если удобнее продиктовать</div>
                        <div className="my-1 text-[26px] font-bold tracking-[0.2em] tabular-nums">{data?.inviteCode ?? '······'}</div>
                        <div className="flex justify-center gap-2">
                            <Button variant="ghost" size="sm" disabled={!data} onClick={() => copy(data!.inviteCode, 'Код')}>
                                <Copy className="h-3.5 w-3.5" /> Код
                            </Button>
                            <Button variant="ghost" size="sm" disabled={!data} onClick={() => setRenewOpen(true)}>
                                <RefreshCw className="h-3.5 w-3.5" /> Новый код
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">Сменить код приглашения?</DialogTitle>
                    </DialogHeader>
                    <p className="m-0 text-[13px] text-muted-foreground">
                        Старая ссылка и старый код перестанут работать. Это нужно, если ссылка ушла не тем людям. Водители, которые
                        уже в парке, останутся.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setRenewOpen(false)}>Оставить</Button>
                        <Button onClick={renew} disabled={renewing}>
                            {renewing && <Loader2 className="h-4 w-4 animate-spin" />} Сменить код
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
