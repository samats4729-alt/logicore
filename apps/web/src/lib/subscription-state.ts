import dayjs from 'dayjs';
import { dayMonth } from '@/lib/ru-date';
import { moneyShort } from '@/lib/money-format';
import { daysWord, monthsWord } from '@/components/billing/SubscriptionBuyModal';

/**
 * Что написано про подписку — одними словами на весь кабинет.
 *
 * Состояние подписки показывается в двух местах: плиткой «Тариф» на главной
 * и отдельной страницей «Подписка», куда человек приходит продлевать. Две
 * копии этих формулировок разъехались бы в первый же месяц, и человек читал
 * бы про свою подписку разное на соседних экранах.
 *
 * Слова разные не ради разнообразия: «пробный период» у новой компании и
 * «осталось три дня» у той, что работает год, — это разные новости, и путать
 * их нельзя.
 */

export interface BillingStatus {
    enabled: boolean;
    blocked: boolean;
    status?: string | null;
    until?: string | null;
    daysLeft?: number | null;
    /** Цена за одного сотрудника в месяц. */
    pricePerUser?: number;
    /** Сколько сотрудников оплачивается — водители не в счёт. */
    users?: number;
    /** Сумма в месяц при нынешнем числе сотрудников: считает сервер. */
    monthlyTotal?: number;
    /** Настроена ли оплата картой. Решает сервер: ключи магазина живут у него. */
    cardPayment?: boolean;
    request?: { id: string; months: number; amount: number; createdAt: string } | null;
}

export interface SubscriptionView {
    /** Главная строка: «Бесплатно», «Оплачено до 14 октября». */
    value: string;
    /** Пояснение под ней. */
    sub: string;
    /** Подпись кнопки или `null`, если делать нечего. */
    action: string | null;
    /** Срок поджимает — рамку рисуем тревожной. */
    urgent: boolean;
    pricePerUser: number;
    users: number;
    /** Сумма в месяц при нынешнем числе сотрудников. */
    price: number;
    /** «5 000 ₸ × 3 = 15 000 ₸ в месяц» — разбор суммы для человека. */
    perMonthText: string;
}

export function subscriptionView(status: BillingStatus): SubscriptionView {
    const pricePerUser = status.pricePerUser ?? 0;
    const users = status.users ?? 1;
    // Сумму берём с сервера, а не перемножаем здесь: правило «кто считается
    // сотрудником» живёт в одном месте, и экран его не повторяет.
    const price = status.monthlyTotal ?? pricePerUser * users;
    const until = status.until ? dayjs(status.until) : null;
    const left = status.daysLeft ?? null;

    /**
     * Из чего сложилась сумма: «5 000 ₸ × 3 = 15 000 ₸».
     *
     * Без разбора цифра выглядит взятой с потолка, и первый же вопрос
     * бухгалтера — «почему столько». Когда сотрудник один, разбирать нечего.
     */
    const perMonthText = users > 1
        ? `${moneyShort(pricePerUser)} × ${users} = ${moneyShort(price)} в месяц`
        : `${moneyShort(price)} в месяц`;

    const общее = { pricePerUser, users, price, perMonthText };

    if (!status.enabled) {
        // Те же слова, что на лендинге: человек читает про тариф в двух
        // местах, и в обоих ему должны сказать одно и то же.
        return {
            ...общее,
            value: 'Бесплатно',
            sub: 'на время тестирования · доступ открыт',
            action: null,
            urgent: false,
        };
    }
    if (status.request) {
        return {
            ...общее,
            value: 'Запрос отправлен',
            sub: `${monthsWord(status.request.months)} · ${moneyShort(status.request.amount)} · ждём счёт`,
            action: null,
            urgent: false,
        };
    }
    if (status.status === 'ACTIVE' && until) {
        return {
            ...общее,
            value: `Оплачено до ${dayMonth(until)}`,
            sub: `${perMonthText}${left != null ? ` · осталось ${daysWord(left)}` : ''}`,
            action: 'Продлить',
            urgent: false,
        };
    }
    if (status.status === 'ACTIVE') {
        return { ...общее, value: 'Подписка активна', sub: 'бессрочно', action: null, urgent: false };
    }
    if (status.status === 'GRACE' && until) {
        return {
            ...общее,
            value: `Осталось ${daysWord(left ?? 0)}`,
            sub: `${perMonthText} · после ${dayMonth(until)} доступ закроется`,
            action: 'Купить подписку',
            urgent: true,
        };
    }
    if (status.status === 'TRIAL' && until) {
        return {
            ...общее,
            value: `Пробный период до ${dayMonth(until)}`,
            sub: `${left != null ? `осталось ${daysWord(left)} · ` : ''}дальше ${perMonthText}`,
            action: 'Оформить',
            urgent: (left ?? 99) <= 3,
        };
    }
    return {
        ...общее,
        value: 'Подписка не активна',
        sub: until ? `срок закончился ${dayMonth(until)}` : perMonthText,
        action: 'Оформить',
        urgent: true,
    };
}
