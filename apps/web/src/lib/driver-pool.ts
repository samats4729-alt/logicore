import { api } from '@/lib/api';

/**
 * Общая база водителей компании: свои и водители всех своих перевозчиков.
 *
 * Раньше в заявке после выбора перевозчика показывались только его водители,
 * и того, кто вчера ехал от соседнего ИП, заводили заново. Сервер отдаёт всю
 * базу разом (`GET /company/drivers/pool`), а рядом с каждым — у кого он
 * прописан и за кого уже ездил: по этому экран поднимает наверх знакомых
 * выбранному перевозчику.
 */
export interface PoolDriver {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    phone: string;
    iin?: string | null;
    vehicleType?: string | null;
    vehiclePlate?: string | null;
    vehicleModel?: string | null;
    trailerNumber?: string | null;
    docType?: string | null;
    docNumber?: string | null;
    docIssuedAt?: string | null;
    docExpiresAt?: string | null;
    docIssuedBy?: string | null;
    /** У кого прописан: перевозчик или сама компания. */
    companyId: string | null;
    companyName: string | null;
    /** Прописан у самой компании — штатный. */
    isStaff: boolean;
    /**
     * Кто это для компании: штатный, водитель перевозчика (прописан у ИП из
     * справочника) или нештатный без перевозчика — человек со своей машиной,
     * которого ни у кого не прописать.
     */
    kind: DriverKind;
    /** Сколько рейсов отвёз за перевозчиков компании. */
    tripsCount: number;
    /** За кого может ехать без вопросов: у кого прописан и за кого уже ездил. */
    carrierIds: string[];
    lastTrip: { at: string; carrierId: string; carrierName: string | null } | null;
}

export type DriverKind = 'STAFF' | 'CARRIER' | 'INDEPENDENT';

/**
 * Кто это, словами: «Штатный» или «Нештатный», и уточнение — у какого
 * перевозчика числится. Одни слова на странице «Водители» и в выборе
 * водителя в заявке.
 */
export function driverKindLabel(d: Pick<PoolDriver, 'kind' | 'companyName'>): { label: string; detail: string | null } {
    if (d.kind === 'STAFF') return { label: 'Штатный', detail: null };
    if (d.kind === 'CARRIER') return { label: 'Нештатный', detail: d.companyName };
    return { label: 'Нештатный', detail: 'без перевозчика' };
}

export async function fetchDriverPool(): Promise<PoolDriver[]> {
    const res = await api.get('/company/drivers/pool');
    return res.data || [];
}

/** Поля карточки водителя в формах назначения — те, что уходят в его карточку. */
export const DRIVER_CARD_FIELDS = [
    'firstName', 'lastName', 'middleName', 'phone', 'iin',
    'vehicleType', 'vehicleModel', 'vehiclePlate', 'trailerNumber',
    'docType', 'docNumber', 'docIssuedAt', 'docExpiresAt', 'docIssuedBy',
] as const;

/**
 * Машина рейса для сервера.
 *
 * Номер тягача и прицепа, как их ввели в форме, уходят в заявку: у каждого ИП
 * своя машина, и доверенность обязана показать ту, на которой едут в этом
 * рейсе. Поле не заполняли вовсе (форма водителя не открывалась) — не
 * отправляем, и сервер оставит как было. Прицеп стёрли — отправляем пустую
 * строку: «в этом рейсе без прицепа».
 */
export function tripVehicle(values: { vehiclePlate?: string | null; trailerNumber?: string | null }) {
    return {
        ...(values.vehiclePlate != null ? { tripPlate: String(values.vehiclePlate) } : {}),
        ...(values.trailerNumber !== undefined ? { tripTrailer: values.trailerNumber ? String(values.trailerNumber) : '' } : {}),
    };
}

/** Водитель и машина рейса — как они записаны в заявке. */
export interface ВодительРейса {
    driverId?: string | null;
    assignedDriverName?: string | null;
    assignedDriverPlate?: string | null;
    assignedDriverTrailer?: string | null;
}

/** Кого на кого сменили: водителя или только машину. */
export interface ЗаменаНаРейсе {
    водитель: boolean;
    было: string;
    стало: string;
}

/**
 * Что поменяли на рейсе при назначении — водителя, машину или ничего.
 *
 * По ней сразу после замены предлагаем отправить новую доверенность: в ней
 * водитель и машина, и прежняя, уже отправленная складу, называет не тех.
 * Первое назначение — не замена: прежней доверенности не было. Рейс отдали
 * перевозчику на платформе — водителя в заявке нет, выписывать не на кого.
 */
export function заменаНаРейсе(было?: ВодительРейса | null, стало?: ВодительРейса | null): ЗаменаНаРейсе | null {
    const есть = (в?: ВодительРейса | null): в is ВодительРейса => !!(в?.driverId || в?.assignedDriverName?.trim());
    if (!есть(было) || !есть(стало)) return null;
    const чисто = (с?: string | null) => (с || '').trim();

    // Так же, как решает сервер, гасить ли ссылку прежнего водителя: человек
    // из базы узнаётся по записи, а не по ФИО (поправили отчество — тот же
    // водитель), вписанный вручную — по ФИО.
    const тотЖеВодитель = стало.driverId
        ? стало.driverId === было.driverId
        : !было.driverId && чисто(стало.assignedDriverName) === чисто(было.assignedDriverName);
    if (!тотЖеВодитель) {
        return {
            водитель: true,
            было: чисто(было.assignedDriverName) || 'прежний водитель',
            стало: чисто(стало.assignedDriverName) || 'новый водитель',
        };
    }

    const машина = (в: ВодительРейса) => [чисто(в.assignedDriverPlate), чисто(в.assignedDriverTrailer)]
        .filter(Boolean).join(' / ');
    if (машина(было) === машина(стало)) return null;
    return { водитель: false, было: машина(было) || 'без номера', стало: машина(стало) || 'без номера' };
}

/**
 * «Водитель уже есть в базе» — одними словами во всех формах.
 *
 * В заявке найденный водитель сразу и назначается — там достаточно сказать,
 * что взяли его. В карточке перевозчика иначе: прописан он у другого ИП, в
 * списке этого не появится, и без пояснения человек решит, что сохранение
 * не прошло, и заведёт его ещё раз.
 */
export function alreadyExistsMessage(
    data: { sharedFromName?: string | null },
    опции: { вЗаявке?: boolean; вСписке?: boolean } = { вЗаявке: true },
) {
    // На странице «Водители» он и так перед глазами: достаточно сказать, что
    // второго не завели, а данные обновили.
    if (опции.вСписке) {
        return data.sharedFromName
            ? `Этот водитель уже был в списке (числится у «${data.sharedFromName}») — второго не завели, данные обновили`
            : 'Этот водитель уже был в списке — второго не завели, данные обновили';
    }
    if (!data.sharedFromName) return 'Водитель уже есть в базе — используем его, данные обновили';
    return опции.вЗаявке
        ? `Водитель уже есть в базе (прописан у «${data.sharedFromName}») — используем его`
        : `Водитель уже есть в базе (прописан у «${data.sharedFromName}»). Заводить заново не нужно: в заявке его можно выбрать для любого перевозчика`;
}
