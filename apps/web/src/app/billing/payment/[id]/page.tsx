'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, CreditCard, XCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { monthsWord } from '@/components/billing/SubscriptionBuyModal';
import nova from '@/components/nova/nova.module.css';
import styles from './payment-result.module.css';

/**
 * Возвращение из банка.
 *
 * Страница ничего не решает: она спрашивает сервер, что стало с платежом.
 * Сам по себе возврат браузера ничего не доказывает — по этому адресу можно
 * зайти и руками, набрав его. Подписку продлевает только подписанный ответ
 * платёжной системы, а он идёт своим путём, минуя браузер.
 *
 * Отсюда и ожидание: человек обычно возвращается на секунду-две раньше, чем
 * до нас доходит подтверждение. Пока платёж «в ожидании», страница
 * переспрашивает сервер каждые две секунды — но не бесконечно: через минуту
 * честно говорит, что подтверждение задерживается, вместо того чтобы
 * крутить колесо до вечера.
 */

/** Как часто переспрашиваем и сколько всего ждём. */
const ОПРОС_МС = 2000;
const ЖДЁМ_МС = 60_000;

interface Платёж {
    id: string;
    months: number;
    amount: number;
    users: number;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    paidAt: string | null;
    appliedAt: string | null;
    failureDescription: string | null;
    cardPan: string | null;
    redirectUrl: string | null;
}

export default function PaymentResultPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const search = useSearchParams();
    // Банк вернул человека по адресу отказа. Это подсказка, а не приговор:
    // правду всё равно приносит ответ платёжной системы.
    const банкСказалОтказ = search.get('failed') === '1';

    const [платёж, setПлатёж] = useState<Платёж | null>(null);
    const [ошибка, setОшибка] = useState<string | null>(null);
    const [ждём, setЖдём] = useState(true);
    const началоRef = useRef(Date.now());

    const load = useCallback(async () => {
        try {
            const { data } = await api.get<Платёж>(`/billing/card-payment/${id}`);
            setПлатёж(data);
            return data;
        } catch (e: any) {
            setОшибка(e.response?.data?.message || 'Платёж не найден');
            setЖдём(false);
            return null;
        }
    }, [id]);

    useEffect(() => {
        let жив = true;
        let таймер: ReturnType<typeof setTimeout>;

        const шаг = async () => {
            const данные = await load();
            if (!жив) return;
            if (!данные) return;
            if (данные.status !== 'PENDING') {
                setЖдём(false);
                return;
            }
            if (Date.now() - началоRef.current > ЖДЁМ_МС) {
                setЖдём(false);
                return;
            }
            таймер = setTimeout(шаг, ОПРОС_МС);
        };

        шаг();
        return () => { жив = false; clearTimeout(таймер); };
    }, [load]);

    const состояние = платёж?.status ?? 'PENDING';
    const оплачено = состояние === 'SUCCESS' && !!платёж?.appliedAt;
    // Деньги приняты, а подписка не продлена — так бывает при расхождении
    // суммы. Молчать нельзя: человек заплатил.
    const странно = состояние === 'SUCCESS' && !платёж?.appliedAt;

    return (
        <div className={styles.wrap}>
            <div className={`${styles.icon}${оплачено ? ` ${styles.iconOk}` : ''}${состояние === 'FAILED' ? ` ${styles.iconBad}` : ''}`}>
                {оплачено ? <CheckCircle2 size={22} />
                    : состояние === 'FAILED' ? <XCircle size={22} />
                        : <CreditCard size={22} />}
            </div>

            <h1 className={styles.title}>{заголовок(состояние, оплачено, ждём, ошибка)}</h1>

            <p className={styles.lead}>
                {ошибка
                    ? ошибка
                    : оплачено
                        ? 'Кабинет уже открыт — можно работать.'
                        : странно
                            ? 'Деньги получены, но продлить подписку автоматически не вышло. Мы уже знаем об этом и продлим вручную — напишите нам, если доступ не откроется в течение часа.'
                            : состояние === 'FAILED'
                                ? платёж?.failureDescription || 'Банк отклонил оплату. Деньги остались на карте.'
                                : ждём
                                    ? 'Ждём подтверждение от банка. Обычно это занимает несколько секунд.'
                                    : банкСказалОтказ
                                        ? 'Похоже, оплата не завершилась. Если деньги списались, подтверждение придёт в течение нескольких минут и подписка продлится сама.'
                                        : 'Подтверждение от банка задерживается. Если деньги списались, подписка продлится сама — обновите страницу через несколько минут.'}
            </p>

            {платёж && (
                <section className={styles.card}>
                    <div className={styles.row}>
                        <span>Подписка</span>
                        <b>{monthsWord(платёж.months)}</b>
                    </div>
                    <div className={styles.row}>
                        <span>Сумма</span>
                        <b className={styles.money}>{moneyShort(платёж.amount)}</b>
                    </div>
                    {платёж.cardPan && (
                        <div className={styles.row}>
                            <span>Карта</span>
                            <b>{платёж.cardPan}</b>
                        </div>
                    )}
                </section>
            )}

            <div className={styles.foot}>
                <button
                    type="button"
                    className={`${nova.action} ${nova.actionPrimary}`}
                    onClick={() => router.push('/company')}
                >
                    В кабинет <ArrowRight size={14} />
                </button>
                {!оплачено && (
                    <button
                        type="button"
                        className={nova.action}
                        onClick={() => { началоRef.current = Date.now(); setЖдём(true); load(); }}
                    >
                        <RefreshCw size={14} /> Проверить ещё раз
                    </button>
                )}
            </div>
        </div>
    );
}

function заголовок(
    состояние: Платёж['status'],
    оплачено: boolean,
    ждём: boolean,
    ошибка: string | null,
): string {
    if (ошибка) return 'Платёж не найден';
    if (оплачено) return 'Оплата прошла';
    if (состояние === 'SUCCESS') return 'Оплата получена';
    if (состояние === 'FAILED') return 'Оплата не прошла';
    return ждём ? 'Проверяем оплату' : 'Подтверждение задерживается';
}
