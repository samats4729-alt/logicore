'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Tooltip } from 'antd';
import { Copy, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { resolveCompanyName, shortenCompanyName } from '@/lib/company-helper';
import { adrLabel, loadingLabel, packagingLabel, palletsSummary, totalPallets } from '@/lib/cargo';
import type { ParkOrderCalc } from '@/lib/exchange';
import styles from './order-card.module.css';

/**
 * Карточка рейса: вкладка «Маршрут и груз» и панель над вкладками.
 *
 * «Вариант 5» макета владельца «Заявка — вкладки» (31.10.2026): белый фон и
 * ровные списки, на вкладке одна главная вещь в серой плашке — маршрут.
 * Водитель, стороны сделки и деньги рейса — серой панелью над вкладками
 * (`OrderSideCards`), её видно с любой вкладки, как раньше колонку справа.
 *
 * Маршрут показан лентой, как табло: откуда — куда одной строкой. Точки
 * одноцветные: закрашенная — погрузка, полая — выгрузка. Цвет берётся у
 * текста, поэтому в тёмной теме они белые. Ленту рисуем для прямого рейса из
 * двух точек; там, где точек больше, лента врала бы про порядок — такой
 * маршрут идёт списком.
 *
 * Незаполненные поля груза не занимают место: они свёрнуты в одну строку,
 * а в заголовке видно «заполнено 4 из 14». Пустое поле — это не новость, но
 * знать, сколько их, менеджеру нужно.
 */

const dash = '—';

/** Пара «подпись — значение» строкой списка. */
function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className={styles.row}>
            <span className={styles.k}>{label}</span>
            <span>{children}</span>
        </div>
    );
}

const PLURAL_DAYS = ['день', 'дня', 'дней'];

/** Русское склонение: 1 день, 2 дня, 5 дней. */
function plural(n: number, forms: string[]) {
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 14) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
}

/**
 * Сколько рейс занимает по плану — из дат погрузки и выгрузки.
 *
 * Километров в заявке нет, и придумывать их нельзя: менеджер поверит
 * цифре и посчитает по ней ставку. Срок же в заявке есть, и он говорит
 * ровно то, что нужно на ленте.
 */
function planDuration(from?: string, to?: string) {
    if (!from || !to) return null;
    const hours = dayjs(to).diff(dayjs(from), 'hour');
    if (hours <= 0) return null;
    if (hours < 24) return `${hours} ч в пути`;
    const days = Math.round(hours / 24);
    return `${days} ${plural(days, PLURAL_DAYS)} в пути`;
}

function pointKind(pt: any) {
    if (pt.pointType === 'DELIVERY') return 'Выгрузка';
    if (pt.pointType === 'ADDITIONAL_PICKUP') return 'Доп. погрузка';
    return 'Погрузка';
}

function pointCity(pt: any) {
    return pt.location?.city || pt.location?.name || dash;
}

function pointWhen(pt: any) {
    return pt.expectedDate ? dayjs(pt.expectedDate).format('DD.MM.YYYY, HH:mm') : null;
}

/** Ссылка WhatsApp по номеру: только цифры, как ждёт wa.me. */
const whatsappHref = (phone: string) => `https://wa.me/${String(phone).replace(/[^\d]/g, '')}`;

/** Телефон, копирование и WhatsApp — одинаково у водителя и заказчика. */
function Phone({ phone, copied }: { phone: string; copied: string }) {
    return (
        <>
            <a href={`tel:${phone}`}>{phone}</a>
            <button
                type="button"
                className={styles.copy}
                title="Скопировать номер"
                aria-label="Скопировать номер"
                onClick={() => {
                    navigator.clipboard?.writeText(String(phone));
                    toast.success(copied);
                }}
            >
                <Copy size={13} />
            </button>
            <a href={whatsappHref(phone)} target="_blank" rel="noreferrer" className={styles.wa} title="Написать в WhatsApp">
                WhatsApp
            </a>
        </>
    );
}

export interface OrderDetailsProps {
    order: any;
    fmt: (n: number) => string;
    palletLines: any[];
}

/** Ключи груза, которые идут сводкой под названием, а не строками списка. */
const CARGO_SUMMARY = ['weight', 'volume', 'places', 'body'];

/**
 * Вкладка «Маршрут и груз»: куда едем и что везём.
 */
export default function OrderDetails({ order, fmt, palletLines }: OrderDetailsProps) {
    const [showEmpty, setShowEmpty] = useState(false);

    const points: any[] = order.routePoints || [];
    const first = points[0];
    const last = points[points.length - 1];
    const asRibbon = points.length === 2;
    const duration = planDuration(first?.expectedDate, last?.expectedDate);

    /**
     * Поля груза одним списком: сначала те, за чем сюда приходят, дальше
     * подробности. Пустые не выбрасываем — их считают и сворачивают.
     */
    const cargoFields = useMemo(() => {
        const dims = order.cargoLength || order.cargoWidth || order.cargoHeight
            ? `${order.cargoLength ?? dash} × ${order.cargoWidth ?? dash} × ${order.cargoHeight ?? dash} м`
            : null;

        const places = palletLines.length
            ? `${order.palletCount ?? totalPallets(palletLines)} — ${palletsSummary(palletLines)}`
            : order.palletCount
                ? `${order.palletCount} палет`
                : order.placesCount ?? null;

        return [
            { label: 'Груз', value: order.cargoDescription || null, key: 'cargo' },
            { label: 'Вес', value: order.cargoWeight ? `${fmt(order.cargoWeight)} кг` : null, key: 'weight' },
            { label: 'Мест', value: places, key: 'places' },
            { label: 'Тип кузова', value: order.cargoType || null, key: 'body' },
            { label: 'Объём', value: order.cargoVolume ? `${order.cargoVolume} м³` : null, key: 'volume' },
            { label: 'Габариты (Д×Ш×В)', value: dims, key: 'dims' },
            { label: 'Характер груза', value: order.natureOfCargo || null, key: 'nature' },
            {
                label: 'Способ погрузки',
                value: order.loadingTypes?.length ? order.loadingTypes.map(loadingLabel).join(', ') : null,
                key: 'loading',
            },
            {
                label: 'Упаковка',
                value: order.packagingTypes?.length ? order.packagingTypes.map(packagingLabel).join(', ') : null,
                key: 'packaging',
            },
            {
                label: 'Температура',
                value: order.tempMin != null || order.tempMax != null
                    ? `${order.tempMin ?? dash} … ${order.tempMax ?? dash} °C`
                    : null,
                key: 'temp',
            },
            {
                label: 'Штабелирование',
                value: order.stackable == null ? null : order.stackable ? 'Допускается' : 'Запрещено',
                key: 'stack',
            },
            {
                label: 'Опасный груз',
                key: 'adr',
                value: order.adr ? (
                    // Полная расшифровка класса длинная и ломает колонку —
                    // держим её в подсказке.
                    <Tooltip title={order.adrClass ? adrLabel(order.adrClass) : 'Класс не указан'}>
                        <span className={styles.adr}>
                            ДОПОГ{order.adrClass ? ` · класс ${order.adrClass}` : ''}
                        </span>
                    </Tooltip>
                ) : null,
            },
            {
                label: 'Объявленная стоимость',
                value: order.cargoValue ? `${fmt(order.cargoValue)} ₸` : null,
                key: 'value',
            },
            { label: 'Доп. требования', value: order.requirements || null, key: 'req' },
        ];
    }, [order, palletLines, fmt]);

    const filled = cargoFields.filter((f) => f.value);
    const empty = cargoFields.filter((f) => !f.value);

    // Название груза — заголовком, вес, объём, места и кузов — одной строкой
    // под ним; остальное — строками. Число мест без слова читалось бы
    // загадкой, поэтому голому числу подпись добавляется.
    const title = filled.find((f) => f.key === 'cargo');
    const summary = CARGO_SUMMARY
        .map((key) => filled.find((f) => f.key === key))
        .filter(Boolean)
        .map((f) => (f!.key === 'places' && typeof f!.value === 'number' ? `${f!.value} мест` : f!.value));
    const rows = filled.filter((f) => f.key !== 'cargo' && !CARGO_SUMMARY.includes(f.key));

    return (
        <div className={styles.stack}>
            <section className={styles.hero} aria-label="Маршрут">
                <h2 className={styles.head}>
                    Маршрут
                    {points.length > 0 && (
                        <span className={styles.headRight}>
                            {points.length} {plural(points.length, ['точка', 'точки', 'точек'])}
                            {duration ? ` · ${duration}` : ''}
                        </span>
                    )}
                </h2>
                {points.length === 0 ? (
                    <div className={styles.empty}>Точки маршрута не указаны</div>
                ) : asRibbon ? (
                    <div className={styles.route}>
                        <div className={styles.end}>
                            <span className={styles.role}>{pointKind(first)}</span>
                            <span className={styles.city}>{pointCity(first)}</span>
                            <span className={styles.when}>{pointWhen(first) || 'дата не указана'}</span>
                            <span className={styles.addr}>{first.location?.address || dash}</span>
                        </div>
                        <div className={styles.line} aria-hidden>
                            <span className={styles.pin} />
                            <span className={styles.lineBar} />
                            {duration ? <span className={styles.lineGap}>{duration}</span> : null}
                            <span className={`${styles.lineBar} ${styles.lineBarRest}`} />
                            <span className={`${styles.pin} ${styles.pinOut}`} />
                        </div>
                        <div className={`${styles.end} ${styles.endRight}`}>
                            <span className={styles.role}>{pointKind(last)}</span>
                            <span className={styles.city}>{pointCity(last)}</span>
                            <span className={styles.when}>{pointWhen(last) || 'дата не указана'}</span>
                            <span className={styles.addr}>{last.location?.address || dash}</span>
                        </div>
                    </div>
                ) : (
                    <ol className={styles.points}>
                        {points.map((pt: any, i: number) => (
                            <li key={pt.id || i} className={styles.point}>
                                <span className={`${styles.pin} ${pt.pointType === 'DELIVERY' ? styles.pinOut : ''}`} />
                                <span className={styles.k}>{pointKind(pt)}</span>
                                <span>
                                    <b>{pointCity(pt)}</b>
                                    <span className={styles.sub}>{pt.location?.address || dash}</span>
                                </span>
                                <span className={styles.n}>{pointWhen(pt) || ''}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <section className={styles.section} aria-label="Груз">
                <h2 className={styles.head}>
                    Груз
                    <span className={styles.headRight}>заполнено {filled.length} из {cargoFields.length}</span>
                </h2>
                {title && <p className={styles.cargoTitle}>{title.value}</p>}
                {summary.length > 0 && <p className={styles.cargoLine}>{summary.join(' · ')}</p>}
                {(rows.length > 0 || (showEmpty && empty.length > 0)) && (
                    <div className={styles.list}>
                        {rows.map((f) => (
                            <Row key={f.key} label={f.label}>{f.value}</Row>
                        ))}
                        {showEmpty && empty.map((f) => (
                            <Row key={f.key} label={f.label}><span className={styles.muted}>{dash}</span></Row>
                        ))}
                    </div>
                )}

                {empty.length > 0 && (
                    <div style={{ paddingTop: 10 }}>
                        <button type="button" className={styles.lnk} onClick={() => setShowEmpty((v) => !v)}>
                            {showEmpty ? 'Скрыть незаполненные' : `Показать незаполненные (${empty.length})`}
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
}

export interface OrderSideCardsProps {
    order: any;
    partners: any[];
    user: { id?: string; companyId?: string; role?: string } | null;
    fmt: (n: number) => string;
    /** Водитель: значения посчитаны в карточке — здесь только показ. */
    hasDriver: boolean;
    driverName?: string;
    driverPhone?: string;
    driverPlate?: string;
    driverTrailer?: string;
    driverLinkLoading: boolean;
    documentsCount: number;
    openDriverLink: () => void;
    openAssignModal: () => void;
    openTransferModal: () => void;
    onOpenDocuments: () => void;
    /** Парк везёт своим водителем без ИП — его расчёт по рейсу (`useParkOrderCalc`). */
    parkCalc?: ParkOrderCalc | null;
}

/**
 * Панель над вкладками: кто везёт, для кого, кто ведёт и за сколько.
 *
 * Четыре колонки — водитель, заказчик, стороны сделки, деньги рейса. Видна
 * с любой вкладки: водитель и деньги нужны и в документах, и в финансах.
 * Деньги здесь у всех, кто видит рейс, а не только у бухгалтерии: менеджер
 * без права «Бухгалтерия» вкладки «Финансы» не видит, и ставки с маржой ему
 * иначе взять негде.
 */
export function OrderSideCards({
    order,
    partners,
    user,
    fmt,
    hasDriver,
    driverName,
    driverPhone,
    driverPlate,
    driverTrailer,
    driverLinkLoading,
    documentsCount,
    openDriverLink,
    openAssignModal,
    openTransferModal,
    onOpenDocuments,
    parkCalc,
}: OrderSideCardsProps) {
    /**
     * Ставку перевозчику и маржу заказчику не показываем.
     *
     * Своя сторона сделки видна всем участникам, чужая — нет: заказчик,
     * открыв рейс, не должен читать, сколько экспедитор заработал на нём.
     * Если наша компания одновременно и экспедитор, оба числа наши.
     */
    const iAmCustomerOnly = !!user?.companyId
        && order.customerCompanyId === user.companyId
        && order.forwarderId !== user.companyId
        && order.subForwarderId !== user.companyId;

    const customerPrice = order.customerPrice != null ? Number(order.customerPrice) : null;
    const carrierPrice = order.driverCost != null
        ? Number(order.driverCost)
        : order.subForwarderPrice != null ? Number(order.subForwarderPrice) : null;
    const customerCurrency = order.currency || 'KZT';
    const carrierCurrency = order.driverCostCurrency || 'KZT';
    const sign = (code: string) => (code === 'KZT' ? '₸' : code);
    const sameCurrency = customerCurrency === carrierCurrency;
    const margin = customerPrice != null && carrierPrice != null && sameCurrency
        ? customerPrice - carrierPrice
        : null;
    /** Расчёт водителя парка: вместо «ставки перевозчику» — топливо, на руки и налоги. */
    const park = parkCalc?.calc ?? null;
    /**
     * Перевозчик — своя компания (владелец, 29.10.2026: «перевозчик — их
     * компания, водитель назначенный»). Рейс с биржи парк везёт для
     * экспедитора — он здесь перевозчик, а не экспедитор.
     */
    const carrierIsMe = parkCalc?.source === 'TRIP';
    const ownDriver = hasDriver && !!order.forwarderId && order.forwarderId === user?.companyId
        && !order.subForwarder && !(order.partner && order.partnerId !== order.forwarderId);
    const canReplace = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';

    return (
        <section className={styles.panel} aria-label="Водитель, стороны и деньги рейса">
            <div className={styles.pcol}>
                <div className={styles.role}>{carrierIsMe ? 'Водитель парка' : 'Водитель'}</div>
                {hasDriver ? (
                    <>
                        <div className={styles.who}>{driverName || dash}</div>
                        <div className={styles.whoSub}>
                            {driverPlate || 'машина не указана'}
                            {driverTrailer ? ` · прицеп ${driverTrailer}` : ' · без прицепа'}
                        </div>
                        <div className={styles.contacts}>
                            {driverPhone
                                ? <Phone phone={driverPhone} copied="Номер водителя скопирован" />
                                : <span className={styles.muted}>телефон не указан</span>}
                        </div>
                        <div className={styles.acts}>
                            <button type="button" className={styles.lnk} disabled={driverLinkLoading} onClick={openDriverLink}>
                                {driverLinkLoading && <Loader2 size={13} className="animate-spin" />}
                                Ссылка для водителя
                            </button>
                            {/* В пути менять можно — сломалась машина. В
                                завершённом или отменённом рейсе нельзя:
                                кнопка там вела только к отказу сервера. */}
                            {canReplace && (
                                <button type="button" className={styles.lnk} onClick={openAssignModal} aria-label="Заменить водителя">
                                    Заменить
                                </button>
                            )}
                            <button type="button" className={styles.lnk} onClick={onOpenDocuments}>
                                Документы рейса{documentsCount > 0 ? ` (${documentsCount})` : ''}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ marginTop: 6 }}><span className={styles.chipWarn}>Водитель не назначен</span></div>
                        <div className={styles.acts}>
                            <button type="button" className={styles.lnk} onClick={openAssignModal}>
                                Назначить водителя
                            </button>
                            <button type="button" className={styles.lnk} onClick={onOpenDocuments}>
                                Документы рейса{documentsCount > 0 ? ` (${documentsCount})` : ''}
                            </button>
                        </div>
                    </>
                )}
            </div>

            <div className={styles.pcol}>
                <div className={styles.role}>
                    Заказчик{order.customerCompanyId && order.customerCompanyId === user?.companyId ? ' · моя компания' : ''}
                </div>
                <div className={styles.who}>
                    {resolveCompanyName(order.customerCompanyId, partners, order.customerCompany?.name)}
                </div>
                {order.customer && (
                    <>
                        <div className={styles.whoSub}>{order.customer.firstName} {order.customer.lastName}</div>
                        {order.customer.phone && (
                            <div className={styles.contacts}>
                                <Phone phone={order.customer.phone} copied="Номер заказчика скопирован" />
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className={styles.pcol}>
                <div className={styles.party}>
                    <div className={styles.role}>{carrierIsMe ? 'Перевозчик' : 'Экспедитор'}</div>
                    <div className={styles.who}>
                        {resolveCompanyName(order.forwarderId || order.partnerId, partners, order.forwarder?.name || order.partner?.name)}
                    </div>
                    {carrierIsMe && driverName && <div className={styles.whoSub}>водитель парка · {driverName}</div>}
                </div>

                {/* Везёт свой водитель — перевозчик своя же компания, как в журнале заявок. */}
                {!carrierIsMe && ownDriver && (
                    <div className={styles.party}>
                        <div className={styles.role}>Перевозчик</div>
                        <div className={styles.who}>{resolveCompanyName(order.forwarderId, partners, order.forwarder?.name)}</div>
                        {driverName && <div className={styles.whoSub}>свой водитель · {driverName}</div>}
                    </div>
                )}

                {order.subForwarder && (
                    <div className={styles.party}>
                        <div className={styles.role}>Перевозчик</div>
                        <div className={styles.who}>{resolveCompanyName(order.subForwarderId, partners, order.subForwarder.name)}</div>
                    </div>
                )}

                {/* Водитель другой компании (парка с биржи, ИП-субподрядчика) — она
                    перевозчик по документам, а не экспедитор заявки (15.10.2026). */}
                {!order.subForwarder && order.partner && order.partnerId !== order.forwarderId && (
                    <div className={styles.party}>
                        <div className={styles.role}>Перевозчик</div>
                        <div className={styles.who}>{resolveCompanyName(order.partnerId, partners, order.partner.name)}</div>
                    </div>
                )}

                {order.responsibleManager && (
                    <div className={styles.party}>
                        <div className={styles.role}>Менеджер</div>
                        <div className={styles.whoSub}>
                            {order.responsibleManager.firstName} {order.responsibleManager.lastName}
                        </div>
                    </div>
                )}

                {(order.responsibles || []).map((r: any) => (
                    <div key={r.id} className={styles.party}>
                        <div className={styles.role}>
                            Ответственный · {r.company?.name ? shortenCompanyName(r.company.name) : 'компания'}
                        </div>
                        <div className={styles.contacts} style={{ marginTop: 2 }}>
                            <span>{r.user?.lastName} {r.user?.firstName}</span>
                            {r.companyId === user?.companyId
                                && ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '') && (
                                    <button type="button" className={styles.lnk} onClick={openTransferModal}>
                                        Передать
                                    </button>
                                )}
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.pcol}>
                <div className={styles.role}>Деньги рейса</div>
                <div style={{ marginTop: 6 }}>
                    <div className={`${styles.money} ${styles.moneyMain}`}>
                        <span>Ставка заказчика</span>
                        <b>{customerPrice != null ? `${fmt(customerPrice)} ${sign(customerCurrency)}` : dash}</b>
                    </div>

                    {park && (
                        <>
                            <div className={styles.money}>
                                <span>Ставка водителя</span>
                                <b>{fmt(park.base)} ₸</b>
                            </div>
                            <div className={styles.money}>
                                <span>Топливо (ГСМ)</span>
                                <b>{fmt(park.fuel)} ₸</b>
                            </div>
                            <div className={styles.money}>
                                <span>Водителю на руки</span>
                                <b>{fmt(park.driverTotal)} ₸</b>
                            </div>
                            <div className={styles.money}>
                                <span>Налоги по ГПХ</span>
                                <b>{fmt(park.opv + park.vosms + park.so + park.ipn)} ₸</b>
                            </div>
                            <div className={`${styles.money} ${styles.moneyMain}`}>
                                <span>Остаётся парку</span>
                                <b className={park.parkFee >= 0 ? styles.pos : styles.neg}>
                                    {fmt(park.parkFee)} ₸
                                    {park.customerPrice
                                        ? ` · ${(park.parkFee / park.customerPrice * 100).toFixed(1).replace('.', ',')}%`
                                        : ''}
                                </b>
                            </div>
                        </>
                    )}

                    {!iAmCustomerOnly && !park && (
                        <div className={`${styles.money} ${styles.moneyMain}`}>
                            <span>Ставка перевозчику</span>
                            <b>{carrierPrice != null ? `${fmt(carrierPrice)} ${sign(carrierCurrency)}` : dash}</b>
                        </div>
                    )}

                    {!iAmCustomerOnly && !park && margin != null && (
                        <div className={`${styles.money} ${styles.moneyMain}`}>
                            <span>Маржа</span>
                            <b className={margin >= 0 ? styles.pos : styles.neg}>
                                {fmt(margin)} {sign(customerCurrency)}
                                {customerPrice ? ` · ${(margin / customerPrice * 100).toFixed(1).replace('.', ',')}%` : ''}
                            </b>
                        </div>
                    )}

                    {!iAmCustomerOnly && !park && margin == null && customerPrice != null && carrierPrice != null && (
                        <p className={styles.note}>
                            Ставки в разных валютах — маржа считается по курсу на вкладке «Финансы».
                        </p>
                    )}

                    {customerPrice == null && carrierPrice == null && (
                        <p className={styles.note}>
                            Ставки в заявке не указаны. Пока их нет, счёт выставить не с чего.
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
