import { api } from './api';

/**
 * Контрагенты компании — одним списком.
 *
 * Источников два, и с экрана этого не видно. `/partners` — компании,
 * зарегистрированные на платформе, которые приняли наше приглашение;
 * `/external-companies` — карточки справочника, заведённые нами руками.
 * Работают в основном по вторым: партнёрство на платформе есть далеко не с
 * каждым, а счета выставляют и деньги получают от всех.
 *
 * Кто спрашивал только `/partners`, получал почти пустой список. Выбрать
 * своего заказчика в платеже было нельзя, а у уже проведённого платежа поле
 * показывало внутренний код вместо названия: Ant Design печатает само
 * значение, если в списке нет строки с таким `value`. Именно это владелец и
 * увидел — «набор букв и цифр» вместо «ТОО Кока-Кола».
 *
 * Поэтому список собирается здесь, а не на каждом экране заново.
 */

export interface CounterpartyOption {
    id: string;
    name: string;
    /**
     * Стороны, которыми контрагент нам приходится. У компаний с платформы
     * их может не быть вовсе — это не «нет», а «неизвестно», поэтому
     * отсутствие сохраняется как есть, а не превращается в `false`.
     */
    isCustomer?: boolean;
    isCarrier?: boolean;
}

/**
 * `extra` — контрагенты, встреченные в уже загруженных документах.
 *
 * Карточку могли удалить, а менеджеру — закрыть чужих контрагентов
 * настройкой «видит только своих». Но в старом документе имя обязано
 * остаться именем: документ рассказывает, что было, а не что доступно
 * сейчас.
 */
export async function fetchCounterparties(
    extra: Array<CounterpartyOption | null | undefined> = [],
): Promise<CounterpartyOption[]> {
    const [partners, external] = await Promise.all([
        api.get('/partners').catch(() => ({ data: [] })),
        api.get('/external-companies').catch(() => ({ data: [] })),
    ]);

    const known = new Map<string, CounterpartyOption>();
    const add = (item: (Partial<CounterpartyOption> & { id?: string | null }) | null | undefined) => {
        if (!item?.id || known.has(item.id)) return;
        known.set(item.id, {
            id: item.id,
            name: item.name?.trim() || 'Без названия',
            isCustomer: item.isCustomer,
            isCarrier: item.isCarrier,
        });
    };

    for (const item of partners.data || []) add(item);
    for (const item of external.data || []) add(item);
    for (const item of extra) add(item);

    return Array.from(known.values())
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
