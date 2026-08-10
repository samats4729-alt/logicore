'use client';

import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import {
    Copy,
    FileDown,
    FileText,
    Flag,
    Loader2,
    Mail,
    MapPin,
    Package,
    Truck,
    UserPlus,
    Users,
} from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { resolveCompanyName, shortenCompanyName } from '@/lib/company-helper';
import { adrLabel, loadingLabel, packagingLabel, palletsSummary, totalPallets } from '@/lib/cargo';
import styles from './order-details.module.css';

/**
 * Вкладка «Основная информация» карточки рейса.
 *
 * Тот же состав, что и раньше: маршрут, груз, исполнитель с водителем и
 * участники перевозки. Изменилась только подача — блоки, отступы и кнопки
 * взяты из языка кабинета, как на «Деньгах» и «Отчётах». Расчёты, запросы и
 * обработчики остались в карточке и приходят сюда готовыми.
 *
 * Пар «подпись — значение» здесь много, и главное в них — значение. Поэтому
 * подпись мелкая и приглушённая над значением, а не колонкой слева: колонка
 * съедает половину ширины ради слов, которые читают один раз.
 */

const dash = '—';

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className={styles.row}>
            <span className={styles.rowLabel}>{label}</span>
            <span className={styles.rowValue}>{children}</span>
        </div>
    );
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                {icon}
                <h2 className={styles.cardTitle}>{title}</h2>
            </div>
            <div className={styles.cardBody}>{children}</div>
        </section>
    );
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
    const points = order.routePoints || [];

    return (
        <div className={styles.layout}>
            <div className={styles.main}>
                <Card title="Маршрут следования" icon={<MapPin size={14} />}>
                    {points.length === 0 ? (
                        <div className={styles.empty}>Точки маршрута не указаны</div>
                    ) : (
                        <ol className={styles.route}>
                            {points.map((pt: any, i: number) => {
                                const isDelivery = pt.pointType === 'DELIVERY';
                                const isAdditional = pt.pointType === 'ADDITIONAL_PICKUP';
                                const label = isDelivery ? 'Выгрузка' : isAdditional ? 'Доп. погрузка' : 'Погрузка';
                                return (
                                    <li
                                        key={pt.id || i}
                                        className={`${styles.point} ${isDelivery ? styles.pointDelivery : ''} ${isAdditional ? styles.pointExtra : ''}`}
                                    >
                                        <span className={styles.pointDot}>
                                            {isDelivery ? <Flag size={11} /> : <MapPin size={11} />}
                                        </span>
                                        <div className={styles.pointBody}>
                                            <div className={styles.pointHead}>
                                                <b>{label}: {pt.location?.city || pt.location?.name}</b>
                                                {pt.expectedDate && (
                                                    <span className={styles.pointDate}>
                                                        {dayjs(pt.expectedDate).format('DD.MM.YYYY, HH:mm')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={styles.pointAddress}>{pt.location?.address || dash}</div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </Card>

                <Card title="Информация о грузе" icon={<Package size={14} />}>
                    <div className={styles.grid}>
                        <Row label="Груз">{order.cargoDescription || dash}</Row>
                        <Row label="Характер груза">{order.natureOfCargo || dash}</Row>
                        <Row label="Вес">{order.cargoWeight ? `${fmt(order.cargoWeight)} кг` : dash}</Row>
                        <Row label="Объём">{order.cargoVolume ? `${order.cargoVolume} м³` : dash}</Row>
                        {(order.cargoLength || order.cargoWidth || order.cargoHeight) && (
                            <Row label="Габариты (Д×Ш×В)">
                                {`${order.cargoLength ?? dash} × ${order.cargoWidth ?? dash} × ${order.cargoHeight ?? dash} м`}
                            </Row>
                        )}
                        {(order.palletCount || palletLines.length) ? (
                            <Row label="Палеты">
                                {palletLines.length
                                    ? `${order.palletCount ?? totalPallets(palletLines)} — ${palletsSummary(palletLines)}`
                                    : order.palletCount}
                            </Row>
                        ) : null}
                        {order.placesCount ? <Row label="Мест">{order.placesCount}</Row> : null}
                        {order.loadingTypes?.length ? (
                            <Row label="Способ погрузки">{order.loadingTypes.map(loadingLabel).join(', ')}</Row>
                        ) : null}
                        {order.packagingTypes?.length ? (
                            <Row label="Упаковка">{order.packagingTypes.map(packagingLabel).join(', ')}</Row>
                        ) : null}
                        {order.tempMin != null || order.tempMax != null ? (
                            <Row label="Температура">{`${order.tempMin ?? dash} … ${order.tempMax ?? dash} °C`}</Row>
                        ) : null}
                        {order.stackable != null ? (
                            <Row label="Штабелирование">{order.stackable ? 'Допускается' : 'Запрещено'}</Row>
                        ) : null}
                        {order.adr ? (
                            <Row label="Опасный груз">
                                {/* Полная расшифровка класса длинная и ломает колонку —
                                    держим её в подсказке. */}
                                <Tooltip title={order.adrClass ? adrLabel(order.adrClass) : 'Класс не указан'}>
                                    <span className={`${styles.chip} ${styles.chipDanger}`}>
                                        ДОПОГ{order.adrClass ? ` · класс ${order.adrClass}` : ''}
                                    </span>
                                </Tooltip>
                            </Row>
                        ) : null}
                        {order.cargoValue ? (
                            <Row label="Объявленная стоимость">{`${fmt(order.cargoValue)} ₸`}</Row>
                        ) : null}
                        <Row label="Тип кузова">{order.cargoType || dash}</Row>
                        <Row label="Доп. требования">{order.requirements || dash}</Row>
                    </div>
                </Card>
            </div>

            <aside className={styles.side}>
                <Card title="Исполнитель и водитель" icon={<Truck size={14} />}>
                    {hasDriver ? (
                        <>
                            <div className={styles.rows}>
                                <Row label="ФИО">{driverName || dash}</Row>
                                <Row label="Телефон">
                                    {driverPhone ? (
                                        <span className={styles.phone}>
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
                                        </span>
                                    ) : dash}
                                </Row>
                                <Row label="Автомобиль">{driverPlate || dash}</Row>
                                <Row label="Прицеп">{driverTrailer || dash}</Row>
                            </div>

                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={`${styles.act} ${styles.actPrimary}`}
                                    disabled={driverLinkLoading}
                                    onClick={openDriverLink}
                                >
                                    {driverLinkLoading ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                                    Ссылка для водителя
                                </button>
                                <button type="button" className={styles.act} onClick={openAssignModal}>
                                    <UserPlus size={14} /> Изменить водителя
                                </button>
                                <button type="button" className={styles.act} onClick={() => handleDownloadPoA()}>
                                    <FileText size={14} /> Доверенность (PDF)
                                </button>
                                <button type="button" className={styles.act} onClick={() => handleDownloadPoA(true)}>
                                    <FileText size={14} /> Доверенность с печатью
                                </button>
                                <button type="button" className={styles.act} onClick={openSharePoAModal}>
                                    <Mail size={14} /> Отправить доверенность по email
                                </button>
                                <button type="button" className={styles.act} onClick={onOpenDocuments}>
                                    <FileDown size={14} />
                                    Документы рейса{documentsCount > 0 ? ` (${documentsCount})` : ''}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className={styles.noDriver}>
                            <span className={`${styles.chip} ${styles.chipWarn}`}>Водитель не назначен</span>
                            <button
                                type="button"
                                className={`${styles.act} ${styles.actPrimary}`}
                                onClick={openAssignModal}
                            >
                                <UserPlus size={14} /> Назначить водителя
                            </button>
                        </div>
                    )}
                </Card>

                <Card title="Участники перевозки" icon={<Users size={14} />}>
                    <div className={styles.rows}>
                        <Row label="Заказчик">
                            <b>{resolveCompanyName(order.customerCompanyId, partners, order.customerCompany?.name)}</b>
                        </Row>
                        <Row label="Контактное лицо">
                            {order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : dash}
                        </Row>
                        <Row label="Телефон заказчика">
                            {order.customer?.phone
                                ? <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>
                                : dash}
                        </Row>

                        <div className={styles.rowsDivider} />

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
                </Card>
            </aside>
        </div>
    );
}
