'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import type { CabinetNotice } from './SidebarNotices';
import styles from './verification.module.css';

/**
 * Где компания в проверке — и что делать дальше.
 *
 * Человек регистрируется и попадает в пустой кабинет. Что организацию надо
 * заполнить, приложить документы и отправить на проверку, он узнавал
 * только если сам доходил до «Подключения организации». Подсказка говорит
 * это сразу и ведёт ровно на следующий шаг.
 *
 * С 08.10.2026 это карточка в левом меню, рядом с «Помощью» (владелец), а не
 * полоса над каждой страницей.
 *
 * Тон спокойный намеренно: пока подтверждение не обязательно, работать
 * можно и без него. Пугать красным то, что ничего не запирает, — верный
 * способ приучить не читать подсказки вовсе.
 */

/** Ответ `/my-company`: организация, состояние проверки, обязательность. */
type MyCompany = any;

/** Что показать при каждом состоянии проверки. */
const STATE: Record<string, { title: string; action?: string }> = {
    DRAFT: {
        title: 'Организация ещё не отправлена на проверку',
        action: 'Заполнить организацию',
    },
    PENDING: { title: 'Организация на проверке — обычно это занимает один рабочий день' },
    REJECTED: { title: 'Проверка не пройдена', action: 'Посмотреть причину' },
};

/** Подсказка про проверку для левого меню; подтверждена — подсказки нет. */
export function verificationNotice(data: MyCompany): CabinetNotice | null {
    const status: string = data?.verification?.verificationStatus || (data?.company ? 'DRAFT' : 'NONE');
    const required: boolean = Boolean(data?.verificationRequired);
    if (!data || status === 'VERIFIED') return null;

    /* Отказ окончательный: фирму заявил не её владелец. Здесь тон другой —
       это единственное состояние, где подсказка говорит о закрытой двери, и
       молчать об этом нельзя: человек иначе будет жать «Отправить» и не
       понимать, почему ничего не происходит. Ход один — поддержка. */
    if (data?.verification?.verificationBlockedAt) {
        return {
            key: 'verification',
            tone: 'stop',
            icon: ShieldAlert,
            title: 'Заявка отклонена окончательно',
            text: (
                <>
                    {data?.verification?.rejectionReason || 'Организация принадлежит не вам.'}{' '}
                    Создавать заявки и документы нельзя. Если это ошибка — напишите в поддержку,
                    решение пересматривает владелец платформы.
                </>
            ),
            action: { label: 'Написать в поддержку', href: '/company/support' },
        };
    }

    // Организации нет вовсе — самый первый шаг.
    if (status === 'NONE') {
        return {
            key: 'verification',
            tone: 'warn',
            icon: ShieldQuestion,
            title: 'Начните с организации',
            text: 'Название, БИН и вид деятельности — потом документы и проверка.',
            action: { label: 'Заполнить', href: '/company/onboarding' },
        };
    }

    const state = STATE[status] || STATE.DRAFT;
    return {
        key: 'verification',
        // Красным — только окончательный отказ (он выше): остальное ведёт к
        // следующему шагу, и пугать им — приучить не читать подсказки.
        tone: status === 'PENDING' ? 'info' : 'warn',
        icon: ShieldQuestion,
        title: state.title,
        text: required
            ? 'Пока она не подтверждена, заявки и документы создавать нельзя.'
            : 'Вести учёт можно и сейчас — подтверждение это отметка о доверии для контрагентов.',
        action: state.action ? { label: state.action, href: '/company/onboarding' } : undefined,
    };
}

/**
 * Подтвердили — говорим об этом один раз. Метка местная: человек ждал
 * ответа и должен узнать сразу, а не заметить галочку через неделю.
 *
 * Хук живёт в обвязке кабинета, а не в карточке меню: на телефоне меню
 * закрыто, и карточка не нарисована.
 */
export function useVerifiedToast(data: MyCompany) {
    const status: string | undefined = data?.verification?.verificationStatus;
    const verifiedAt: string | undefined = data?.verification?.verifiedAt;
    useEffect(() => {
        if (status !== 'VERIFIED' || !verifiedAt) return;
        if (localStorage.getItem('lc_verified_seen') === verifiedAt) return;
        localStorage.setItem('lc_verified_seen', verifiedAt);
        toast.success('Организация подтверждена', {
            description: 'Проверка пройдена — отметка стоит рядом с названием компании.',
            duration: 8000,
        });
    }, [status, verifiedAt]);
}

interface Props {
    data: MyCompany;
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
