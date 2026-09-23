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
    /** За кого может ехать без вопросов: у кого прописан и за кого уже ездил. */
    carrierIds: string[];
    lastTrip: { at: string; carrierId: string; carrierName: string | null } | null;
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
    опции: { вЗаявке?: boolean } = { вЗаявке: true },
) {
    if (!data.sharedFromName) return 'Водитель уже есть в базе — используем его, данные обновили';
    return опции.вЗаявке
        ? `Водитель уже есть в базе (прописан у «${data.sharedFromName}») — используем его`
        : `Водитель уже есть в базе (прописан у «${data.sharedFromName}»). Заводить заново не нужно: в заявке его можно выбрать для любого перевозчика`;
}
