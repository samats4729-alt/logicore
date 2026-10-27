'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

/**
 * Знакомство с кабинетом при первом входе (задачи шефа, J7: «подсказки и
 * подсветка по каждому блоку»; владелец 25.10.2026 — сделать в самом конце).
 *
 * Без ИИ: владелец назвал гид на ИИ пока слабым. Здесь заранее написанные
 * шаги по разделам меню и шапке, а подсвечивает их та же рамка, что у
 * помощника (`AssistantWidget`, событие `logicore:start-tour`) — второй
 * подсветки в кабинете нет.
 *
 * Показывается один раз на человека в этом браузере. Закрыл — больше не
 * навязываем; пройти снова — «Поддержка» → «Показать знакомство с кабинетом».
 */

export interface TourStep {
    selector?: string;
    say: string;
    /** Шаг без подсветки ждёт «Дальше», а не уходит сам через секунду. */
    wait?: boolean;
}

const menu = (key: string) => `[data-menu-id="lc2-${key}"]`;

const STEPS: TourStep[] = [
    { wait: true, say: 'Добро пожаловать в LogiCore! За минуту покажем, где что лежит. Закрыть можно в любой момент — пройти снова: «Помощь» → «Показать знакомство с кабинетом».' },
    { selector: menu('/company/orders'), say: 'Заявки — все ваши перевозки: создаёте заявку, назначаете водителя и следите за статусом рейса.' },
    { selector: menu('/company/requests'), say: 'Запросы — просьбы заказчиков рассчитать цену перевозки. Ответили ценой — запрос превращается в заявку.' },
    { selector: menu('monitoring_group'), say: 'Мониторинг — где сейчас машины: на карте и по каждому рейсу.' },
    { selector: menu('/company/finance'), say: 'Деньги — счета, акты, оплаты и взаиморасчёты с заказчиками и перевозчиками.' },
    { selector: menu('/company/reports'), say: 'Отчёты — маржа по заявкам, обороты, зарплата и бонусы сотрудников.' },
    { selector: menu('/company/cabinet'), say: 'Кабинет — справочники: контрагенты, водители, машины, адреса, договоры и сотрудники.' },
    { selector: menu('/company/park'), say: 'Управление парком — водители биржи, их рейсы и выплаты.' },
    { selector: '[data-guide="global-search"]', say: 'Поиск по всему кабинету: заявки, контрагенты и счета — по номеру или названию.' },
    { selector: '[data-guide="notifications"]', say: 'Уведомления: новые заявки, оплаты и документы от контрагентов.' },
    { selector: '.ai-btn', say: 'Помощник: спросите, например, «как выставить счёт» — покажет по шагам прямо на экране.' },
    { selector: '[data-guide="profile"]', say: 'Ваш профиль, организация и выход. На этом всё — удачной работы!' },
];

/**
 * Начать знакомство. Шаги, которых на этом экране нет (у бухгалтера нет
 * «Заявок», на телефоне меню спрятано), пропускаются сразу — иначе рамка
 * десять секунд искала бы то, чего нет.
 */
export function startWelcomeTour() {
    const steps = STEPS.filter((s) => !s.selector || document.querySelector(s.selector));
    // Помощник подгружается отдельно: не успел — заберёт шаги при загрузке.
    (window as Window & { __lcPendingTour?: TourStep[] }).__lcPendingTour = steps;
    window.dispatchEvent(new CustomEvent('logicore:start-tour', { detail: { steps } }));
}

const seenKey = (userId: string) => `lc_welcome_tour_${userId}`;

/** Первый вход на главную кабинета — знакомство само, один раз. */
export default function WelcomeTour() {
    const pathname = usePathname();
    const userId = useAuthStore((s) => s.user?.id);

    useEffect(() => {
        if (!userId || pathname !== '/company') return;
        try {
            if (localStorage.getItem(seenKey(userId))) return;
        } catch {
            return; // Хранилище закрыто — не показываем вовсе, чем показывать при каждом входе.
        }
        // Меню и шапка дорисовываются после загрузки страницы — даём им время.
        const timer = window.setTimeout(() => {
            try { localStorage.setItem(seenKey(userId), new Date().toISOString()); } catch { /* не запомним — покажем ещё раз */ }
            startWelcomeTour();
        }, 1800);
        return () => window.clearTimeout(timer);
    }, [userId, pathname]);

    return null;
}
