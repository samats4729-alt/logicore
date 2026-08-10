'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Tooltip } from 'antd';
import {
    ChevronDown,
    Copy,
    FileText,
    Loader2,
    Mail,
    MapPin,
    Package,
    Route,
    Truck,
    UserPlus,
    Users,
    Wallet,
} from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { resolveCompanyName, shortenCompanyName } from '@/lib/company-helper';
import { adrLabel, loadingLabel, packagingLabel, palletsSummary, totalPallets } from '@/lib/cargo';
import styles from './order-details.module.css';

/**
 * Вкладка «Основная информация» карточки рейса.
 *
 * Экран отвечает на четыре вопроса менеджера: куда едем и что везём (одна
 * широкая карточка «Рейс»), кто везёт, для кого и за сколько (три карточки
 * в ряд). Всё помещается на один экран без прокрутки — раньше маршрут и
 * груз занимали его целиком, а водитель и стороны уезжали вниз.
 *
 * Маршрут показан лентой, как табло: откуда — куда одной строкой. Точки
 * одноцветные: закрашенная — погрузка, полая — выгрузка. Цвет берётся у
 * текста, поэтому в тёмной теме они белые, и настраивать это отдельно не
 * нужно. Ленту рисуем для прямого рейса из двух точек; там, где точек
 * больше, лента врала бы про порядок — такой маршрут идёт списком.
 *
 * Незаполненные поля груза не занимают место: они свёрнуты в одну строку,
 * а в шапке видно «заполнено 4 из 14». Пустое поле — это не новость, но
 * знать, сколько их, менеджеру нужно.
 */

const dash = '—';

/** Пара «подпись — значение». Подпись мелкая и сверху: читают значение. */
function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className={styles.row}>
            <span className={styles.rowLabel}>{label}</span>
            <span className={styles.rowValue}>{children}</span>
        </div>
    );
}

function Card({
    title,
    icon,
    hint,
    children,
}: {
    title: string;
    icon: ReactNode;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                {icon}
                <h2 className={styles.cardTitle}>{title}</h2>
                {hint ? <span className={styles.cardHint}>{hint}</span> : null}
            </div>
            {children}
        </section>
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

export interface OrderDetailsProps {
    order: any;
    partners: any[];
    user: { id?: string; companyId?: string; role?: string } | null;
    fmt: (n: number) => string;
    palletLines: any[];
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
    handleDownloadPoA: (withStamp?: boolean) => void;
    openSharePoAModal: () => void;
    openTransferModal: () => void;
    onOpenDocuments: () => void;
}

export default function OrderDetails({
    order,
    partners,
    user,
    fmt,
    palletLines,
    hasDriver,
    driverName,
    driverPhone,
    driverPlate,
    driverTrailer,
    driverLinkLoading,
    documentsCount,
    openDriverLink,
    openAssignModal,
    handleDownloadPoA,
    openSharePoAModal,
    openTransferModal,
    onOpenDocuments,
}: OrderDetailsProps) {
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
                        <span className={`${styles.chip} ${styles.chipDanger}`}>
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

    return (
        <div className={styles.stack}>
            <Card title="Рейс" icon={<Route size={14} />} hint={`груз: заполнено ${filled.length} из ${cargoFields.length}`}>
                <div className={styles.split}>
                    <div className={styles.splitCell}>
                        {points.length === 0 ? (
                            <div className={styles.empty}>Точки маршрута не указаны</div>
                        ) : asRibbon ? (
                            <div className={styles.ribbon}>
                                <div className={styles.ribbonEnd}>
                                    <b>{pointCity(first)}</b>
                                    <span className={styles.ribbonWhen}>{pointWhen(first) || 'дата не указана'}</span>
                                    <span className={styles.ribbonAddr}>{first.location?.address || dash}</span>
                                </div>
                                <div className={styles.ribbonMid} aria-hidden>
                                    <span className={styles.dot} />
                                    <span className={styles.ribbonBar} />
                                    {duration ? <span className={styles.ribbonGap}>{duration}</span> : null}
                                    <span className={styles.ribbonBar} />
                                    <span className={`${styles.dot} ${styles.dotOut}`} />
                                </div>
                                <div className={`${styles.ribbonEnd} ${styles.ribbonEndRight}`}>
                                    <b>{pointCity(last)}</b>
                                    <span className={styles.ribbonWhen}>{pointWhen(last) || 'дата не указана'}</span>
                                    <span className={styles.ribbonAddr}>{last.location?.address || dash}</span>
                                </div>
                            </div>
                        ) : (
                            <ol className={styles.route}>
                                {points.map((pt: any, i: number) => (
                                    <li
                                        key={pt.id || i}
                                        className={`${styles.point} ${pt.pointType === 'DELIVERY' ? styles.pointOut : ''}`}
                                    >
                                        <span className={styles.dot} />
                                        <div className={styles.pointBody}>
                                            <div className={styles.pointHead}>
                                                <b>
                                                    <span className={styles.pointKind}>{pointKind(pt)}</span>
                                                    {pointCity(pt)}
                                                </b>
                                                {pointWhen(pt) && (
                                                    <span className={styles.pointDate}>{pointWhen(pt)}</span>
                                                )}
                                            </div>
                                            <div className={styles.pointAddress}>{pt.location?.address || dash}</div>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>

                    <div className={styles.splitCell}>
                        <div className={styles.grid}>
                            {filled.map((f) => (
                                <Row key={f.key} label={f.label}>{f.value}</Row>
                            ))}
                            {showEmpty && empty.map((f) => (
                                <Row key={f.key} label={f.label}>{dash}</Row>
                            ))}
                        </div>

                        {empty.length > 0 && (
                            <button type="button" className={styles.fold} onClick={() => setShowEmpty((v) => !v)}>
                                <ChevronDown size={13} className={showEmpty ? styles.foldOpen : undefined} />
                                {showEmpty ? 'Скрыть незаполненные' : 'Показать остальные поля'}
                                {!showEmpty && (
                                    <span className={styles.foldHint}>
                                        {empty.map((f) => f.label.toLowerCase()).join(', ')} — не заполнены
                                    </span>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </Card>

            <div className={styles.trio}>
                <Card title="Водитель и машина" icon={<Truck size={14} />}>
                    <div className={styles.cardBody}>
                        {hasDriver ? (
                            <>
                                <div className={styles.driver}>
                                    <div className={styles.driverName}>{driverName || dash}</div>
                                    <div className={styles.driverSub}>
                                        {driverPlate || 'машина не указана'}
                                        {driverTrailer ? ` · прицеп ${driverTrailer}` : ' · без прицепа'}
                                    </div>
                                    {driverPhone ? (
                                        <div className={styles.phone}>
                                            <a href={`tel:${driverPhone}`}>{driverPhone}</a>
                                            <a
                                                href={`https://wa.me/${String(driverPhone).replace(/[^\d]/g, '')}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={styles.wa}
                                                title="Написать в WhatsApp"
                                            >
                                                WhatsApp
                                            </a>
                                            <button
                                                type="button"
                                                className={styles.copy}
                                                title="Скопировать номер"
                                                onClick={() => {
                                                    navigator.clipboard?.writeText(String(driverPhone));
                                                    toast.success('Номер водителя скопирован');
                                                }}
                                            >
                                                <Copy size={13} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={styles.phone}>
                                            <span className={styles.muted}>телефон не указан</span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    className={`${styles.act} ${styles.actPrimary} ${styles.actWide}`}
                                    disabled={driverLinkLoading}
                                    onClick={openDriverLink}
                                >
                                    {driverLinkLoading
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : <MapPin size={14} />}
                                    Ссылка для водителя
                                </button>

                                <div className={styles.acts}>
                                    <button type="button" className={styles.act} onClick={openAssignModal}>
                                        <UserPlus size={13} /> Заменить водителя
                                    </button>
                                    <button type="button" className={styles.act} onClick={onOpenDocuments}>
                                        <FileText size={13} />
                                        Документы рейса{documentsCount > 0 ? ` (${documentsCount})` : ''}
                                    </button>
                                </div>

                                {/* Три действия с одной бумагой: подпись группы
                                    держит смысл, иначе «с печатью» и «на почту»
                                    приходится угадывать. */}
                                <div className={styles.group}>
                                    <span className={styles.groupLabel}>Доверенность</span>
                                    <div className={styles.acts}>
                                        <button type="button" className={styles.act} onClick={() => handleDownloadPoA()}>
                                            Скачать
                                        </button>
                                        <button type="button" className={styles.act} onClick={() => handleDownloadPoA(true)}>
                                            С печатью
                                        </button>
                                        <button type="button" className={styles.act} onClick={openSharePoAModal}>
                                            <Mail size={13} /> На почту
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className={styles.noDriver}>
                                <span className={`${styles.chip} ${styles.chipWarn}`}>Водитель не назначен</span>
                                <button
                                    type="button"
                                    className={`${styles.act} ${styles.actPrimary} ${styles.actWide}`}
                                    onClick={openAssignModal}
                                >
                                    <UserPlus size={14} /> Назначить водителя
                                </button>
                                <button type="button" className={`${styles.act} ${styles.actWide}`} onClick={onOpenDocuments}>
                                    <FileText size={13} />
                                    Документы рейса{documentsCount > 0 ? ` (${documentsCount})` : ''}
                                </button>
                            </div>
                        )}
                    </div>
                </Card>

                <Card title="Стороны сделки" icon={<Users size={14} />}>
                    <div className={styles.cardBody}>
                        <div className={styles.rows}>
                            <Row label="Заказчик">
                                <b>{resolveCompanyName(order.customerCompanyId, partners, order.customerCompany?.name)}</b>
                                {order.customer && (
                                    <>
                                        <br />
                                        {order.customer.firstName} {order.customer.lastName}
                                        {order.customer.phone && (
                                            <> · <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></>
                                        )}
                                    </>
                                )}
                            </Row>

                            <Row label="Экспедитор">
                                <b>{resolveCompanyName(order.forwarderId || order.partnerId, partners, order.forwarder?.name || order.partner?.name)}</b>
                            </Row>

                            {order.subForwarder && (
                                <Row label="Перевозчик">
                                    <b>{resolveCompanyName(order.subForwarderId, partners, order.subForwarder.name)}</b>
                                </Row>
                            )}

                            {order.responsibleManager && (
                                <Row label="Менеджер">
                                    {order.responsibleManager.firstName} {order.responsibleManager.lastName}
                                </Row>
                            )}

                            {(order.responsibles || []).map((r: any) => (
                                <Row
                                    key={r.id}
                                    label={`Ответственный · ${r.company?.name ? shortenCompanyName(r.company.name) : 'компания'}`}
                                >
                                    <b>{r.user?.lastName} {r.user?.firstName}</b>
                                    {r.companyId === user?.companyId
                                        && ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '') && (
                                            <button type="button" className={styles.link} onClick={openTransferModal}>
                                                Передать
                                            </button>
                                        )}
                                </Row>
                            ))}
                        </div>
                    </div>
                </Card>

                <Card title="Деньги рейса" icon={<Wallet size={14} />}>
                    <div className={styles.cardBody}>
                        <div className={styles.money}>
                            <span>Ставка заказчика</span>
                            <b>{customerPrice != null ? `${fmt(customerPrice)} ${sign(customerCurrency)}` : dash}</b>
                        </div>

                        {!iAmCustomerOnly && (
                            <div className={styles.money}>
                                <span>Ставка перевозчику</span>
                                <b>{carrierPrice != null ? `${fmt(carrierPrice)} ${sign(carrierCurrency)}` : dash}</b>
                            </div>
                        )}

                        {!iAmCustomerOnly && margin != null && (
                            <>
                                <div className={`${styles.money} ${styles.moneyBig}`}>
                                    <span>Маржа</span>
                                    <b>{fmt(margin)} {sign(customerCurrency)}</b>
                                </div>
                                {customerPrice ? (
                                    <div className={styles.money}>
                                        <span className={styles.muted}>рентабельность</span>
                                        <b className={styles.moneyPct}>
                                            {(margin / customerPrice * 100).toFixed(1).replace('.', ',')}%
                                        </b>
                                    </div>
                                ) : null}
                            </>
                        )}

                        {!iAmCustomerOnly && margin == null && customerPrice != null && carrierPrice != null && (
                            <div className={styles.note}>
                                Ставки в разных валютах — маржа считается по курсу на вкладке «Финансы».
                            </div>
                        )}

                        {customerPrice == null && carrierPrice == null && (
                            <div className={styles.note}>
                                Ставки в заявке не указаны. Пока их нет, счёт выставить не с чего.
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
