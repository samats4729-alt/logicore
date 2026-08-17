'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import styles from './verification-strip.module.css';

/**
 * Где компания в проверке — и что делать дальше.
 *
 * Человек регистрируется и попадает в пустой кабинет. Что организацию надо
 * заполнить, приложить документы и отправить на проверку, он узнавал
 * только если сам доходил до «Подключения организации». Полоса говорит это
 * первым же экраном и ведёт ровно на следующий шаг.
 *
 * Тон спокойный намеренно: пока подтверждение не обязательно, работать
 * можно и без него. Пугать красным то, что ничего не запирает, — верный
 * способ приучить не читать полосы вовсе.
 */

interface Props {
    /** Ответ `/my-company`: организация, состояние проверки, обязательность. */
    data: any;
}

/** Что показать при каждом состоянии проверки. */
const STATE: Record<string, { title: string; action?: string }> = {
    DRAFT: {
        title: 'Организация ещё не отправлена на проверку',
        action: 'Заполнить и отправить',
    },
    PENDING: { title: 'Организация на проверке — обычно это занимает один рабочий день' },
    REJECTED: { title: 'Проверка не пройдена', action: 'Посмотреть причину' },
};

export function VerificationStrip({ data }: Props) {
    const router = useRouter();
    const status: string = data?.verification?.verificationStatus || (data?.company ? 'DRAFT' : 'NONE');
    const required: boolean = Boolean(data?.verificationRequired);
    const verifiedAt: string | undefined = data?.verification?.verifiedAt;

    /* Подтвердили — говорим об этом один раз. Метка местная: человек ждал
       ответа и должен узнать сразу, а не заметить галочку через неделю. */
    useEffect(() => {
        if (status !== 'VERIFIED' || !verifiedAt) return;
        if (localStorage.getItem('lc_verified_seen') === verifiedAt) return;
        localStorage.setItem('lc_verified_seen', verifiedAt);
        toast.success('Организация подтверждена', {
            description: 'Проверка пройдена — отметка стоит рядом с названием компании.',
            duration: 8000,
        });
    }, [status, verifiedAt]);

    if (!data || status === 'VERIFIED') return null;

    // Организации нет вовсе — самый первый шаг.
    if (status === 'NONE') {
        return (
            <div className={styles.strip}>
                <span className={styles.icon}><ShieldQuestion size={15} /></span>
                <div className={styles.text}>
                    <b>Начните с организации.</b> Название, БИН и вид деятельности — потом документы и проверка.
                </div>
                <button type="button" className={styles.action} onClick={() => router.push('/company/onboarding')}>
                    Заполнить
                </button>
            </div>
        );
    }

    const state = STATE[status] || STATE.DRAFT;

    return (
        <div className={styles.strip}>
            <span className={styles.icon}><ShieldQuestion size={15} /></span>
            <div className={styles.text}>
                <b>{state.title}.</b>{' '}
                {required
                    ? 'Пока она не подтверждена, заявки и документы создавать нельзя.'
                    : 'Вести учёт можно и сейчас — подтверждение это отметка о доверии для контрагентов.'}
            </div>
            {state.action && (
                <button type="button" className={styles.action} onClick={() => router.push('/company/onboarding')}>
                    {state.action}
                </button>
            )}
        </div>
    );
}

/** Отметка рядом с названием компании: проверена или нет. */
export function VerificationBadge({ data }: Props) {
    const [open, setOpen] = useState(false);
    const status: string = data?.verification?.verificationStatus || 'DRAFT';
    if (!data?.company) return null;

    const verified = status === 'VERIFIED';
    return (
        <span
            className={verified ? styles.badgeOk : styles.badge}
            title={verified ? 'Организация подтверждена платформой' : 'Организация ещё не подтверждена'}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            {verified ? <BadgeCheck size={13} /> : <ShieldQuestion size={13} />}
            {open && <span className={styles.badgeText}>{verified ? 'Проверена' : 'Не проверена'}</span>}
        </span>
    );
}
