import StatusPill from '@/components/ui/StatusPill';
import styles from './LandingVisuals.module.css';

/**
 * Картинки главной — экраны продукта, нарисованные разметкой.
 *
 * Эталон — холст «Главная страница — макет» (06.11.2026). Владелец просил
 * показывать продукт настоящими экранами, а не значками и плитками: журнал
 * заявок, карточку рейса, печатные формы веером. Данные условные —
 * «Заказчик А», «Водитель А.».
 *
 * Всё здесь — иллюстрация: для программ чтения с экрана скрыто
 * (`aria-hidden`), а смысл картинки пересказан рядом скрытым текстом.
 * Статусы — та же плашка, что в кабинете, чтобы главная и кабинет не
 * расходились.
 */

const ORDERS = [
    { status: 'IN_TRANSIT', num: 'ЗК-2604', customer: 'ТОО «Заказчик А»', carrier: 'ИП «Перевозчик А»', driver: 'Водитель А.', truck: '847 KZ 02', route: 'Алматы → Шымкент', rate: '620 000', cost: '470 000', invoice: 'АВ-00042' },
    { status: 'AT_DELIVERY', num: 'ЗК-2603', customer: 'АО «Заказчик Б»', carrier: 'ТОО «Перевозчик Б»', driver: 'Водитель Б.', truck: '777 AA 02', route: 'Астана → Костанай', rate: '380 000', cost: '295 000', invoice: 'АВ-00041' },
    { status: 'ASSIGNED', num: 'ЗК-2602', customer: 'ТОО «Заказчик В»', carrier: 'ИП «Перевозчик В»', driver: 'Водитель В.', truck: '012 BCD 04', route: 'Актобе → Атырау', rate: '450 000', cost: '340 000', invoice: null },
    { status: 'COMPLETED', num: 'ЗК-2601', customer: 'ИП «Заказчик Г»', carrier: 'ТОО «Перевозчик Г»', driver: 'Водитель Г.', truck: '345 XYZ 08', route: 'Тараз → Шымкент', rate: '210 000', cost: '150 000', invoice: 'АВ-00039' },
    { status: 'PENDING', num: 'ЗК-2600', customer: 'ТОО «Заказчик Д»', carrier: null, driver: null, truck: null, route: 'Павлодар → Алматы', rate: '510 000', cost: null, invoice: null },
];

const Dash = () => <span className={styles.dim}>—</span>;

/** Журнал заявок кабинета: на компьютере — таблица, на телефоне — карточки. */
export function OrdersJournal() {
    return (
        <>
            <p className={styles.srOnly}>
                Картинка: журнал заявок в кабинете LogiCore — пять рейсов со статусом, заказчиком,
                перевозчиком, водителем, машиной, маршрутом, ставками и номером счёта.
            </p>

            <div className={styles.journal} aria-hidden="true">
                <div className={styles.browserBar}>
                    <span className={styles.address}>logicore.kz/company/orders</span>
                </div>
                <div className={styles.appBar}>
                    <span className={styles.appBrand}>LogiCore</span>
                    <span className={styles.appNav}>
                        <span>Дашборд</span>
                        <span className={styles.appNavOn}>Заявки</span>
                        <span>Мониторинг</span>
                        <span>Финансы</span>
                        <span>Кабинет</span>
                    </span>
                    <span className={styles.appUser}>
                        <span className={styles.avatar}>ЕМ</span>
                        <span className={styles.userText}>
                            <b>Ерлан Мұратов</b>
                            <span>Администратор</span>
                        </span>
                    </span>
                </div>
                <div className={styles.journalBody}>
                    <div className={styles.journalHead}>
                        <div>
                            <div className={styles.kicker}>Заявки · журнал</div>
                            <div className={styles.journalTitle}>Заявки компании</div>
                        </div>
                        <span className={styles.fakeBtn}>Создать заявку</span>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.toolbar}>
                            <span className={styles.tabOn}>Все заявки 37</span>
                            <span className={styles.dim}>Архив 12</span>
                            <span className={styles.search}>Номер, город, заказчик…</span>
                            <span className={styles.filter}>Фильтры</span>
                            <span className={styles.total}>Всего 37</span>
                        </div>
                        <div className={`${styles.row} ${styles.rowHead}`}>
                            <span>Статус</span>
                            <span>№</span>
                            <span>Заказчик</span>
                            <span className={styles.colCarrier}>Перевозчик</span>
                            <span>Водитель</span>
                            <span className={styles.colTruck}>Транспорт</span>
                            <span>Маршрут</span>
                            <span className={styles.num}>Ставка зак.</span>
                            <span className={styles.num}>Ставка перев.</span>
                            <span className={styles.colInvoice}>Счёт</span>
                        </div>
                        {ORDERS.map((o) => (
                            <div key={o.num} className={styles.row}>
                                <span className={styles.pillCell}><StatusPill status={o.status} /></span>
                                <b>{o.num}</b>
                                <span className={styles.ellipsis}>{o.customer}</span>
                                <span className={`${styles.ellipsis} ${styles.colCarrier}`}>{o.carrier ?? <Dash />}</span>
                                <span className={styles.ellipsis}>{o.driver ?? <Dash />}</span>
                                <span className={`${styles.nowrap} ${styles.colTruck}`}>{o.truck ?? <Dash />}</span>
                                <span className={styles.ellipsis}>{o.route}</span>
                                <span className={styles.num}>{o.rate}</span>
                                <span className={`${styles.num} ${o.cost ? styles.neg : ''}`}>{o.cost ?? '—'}</span>
                                <span className={styles.colInvoice}>{o.invoice ? <u>{o.invoice}</u> : <Dash />}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className={styles.journalCards} aria-hidden="true">
                <div className={styles.cardsHead}>
                    <div>
                        <div className={styles.kicker}>Заявки · журнал</div>
                        <div className={styles.cardsTitle}>Заявки компании</div>
                    </div>
                    <span className={styles.fakeBtnSm}>Создать</span>
                </div>
                {ORDERS.slice(0, 3).map((o) => (
                    <div key={o.num} className={styles.orderCard}>
                        <div className={styles.orderCardTop}>
                            <StatusPill status={o.status} />
                            <b>{o.num}</b>
                        </div>
                        <div className={styles.orderCardRoute}>{o.route}</div>
                        <div className={styles.orderCardMeta}>
                            <span>{o.customer}</span>
                            <span className={styles.orderCardRate}>{o.rate}&nbsp;₸</span>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

/** Шаг 1: форма заявки — заказчик найден по БИН. */
export function StepOrder() {
    return (
        <div className={styles.stepVisual} aria-hidden="true">
            <span className={styles.fieldLabel}>Заказчик</span>
            <span className={styles.field}>ТОО «Заказчик А»</span>
            <span className={styles.hint}>Найден по БИН — реквизиты заполнены</span>
            <span className={styles.fieldPair}>
                <span className={styles.field}>Алматы</span>
                <span className={styles.field}>Шымкент</span>
            </span>
        </div>
    );
}

/** Шаг 2: кому отдать рейс. */
export function StepCarrier() {
    return (
        <div className={`${styles.stepVisual} ${styles.gap12}`} aria-hidden="true">
            <span className={styles.segment}>
                <span>Штатный водитель</span>
                <span className={styles.segmentOn}>Партнёр-перевозчик</span>
                <span>Биржа грузов</span>
            </span>
            <span className={styles.carrierRow}>
                <b>ИП «Перевозчик А»</b>
                <span className={styles.dim}>847 KZ 02 · Водитель А.</span>
                <span className={styles.carrierRate}>470 000&nbsp;₸</span>
            </span>
        </div>
    );
}

/** Шаг 3: ход рейса. */
export function StepTracking() {
    return (
        <div className={styles.stepVisual} aria-hidden="true">
            <span className={styles.progress}>
                <span className={styles.barFull} />
                <span className={styles.bar}><span className={styles.barFill} /></span>
                <span className={styles.bar} />
            </span>
            <span className={styles.progressLabels}>
                <span>Погрузка</span>
                <b>В пути</b>
                <span className={styles.dim}>Выгрузка</span>
            </span>
            <span className={styles.hint}>Логист и заказчик видят один и тот же статус</span>
        </div>
    );
}

/** Шаг 4: маржа рейса и документы. */
export function StepMoney() {
    return (
        <div className={styles.money} aria-hidden="true">
            <span className={styles.moneyRow}><span className={styles.dim}>Ставка заказчика</span><span>620 000&nbsp;₸</span></span>
            <span className={styles.moneyRow}><span className={styles.dim}>Ставка перевозчика</span><span>470 000&nbsp;₸</span></span>
            <span className={`${styles.moneyRow} ${styles.moneyTotal}`}><b>Маржа</b><b className={styles.pos}>150 000&nbsp;₸</b></span>
            <span className={styles.miniDocs}>
                <span className={styles.miniDoc} style={{ transform: 'rotate(-4deg)' }}>
                    <b>Счёт на оплату</b>
                    <span className={styles.line} style={{ width: '90%' }} />
                    <span className={styles.line} style={{ width: '70%' }} />
                    <span className={styles.miniBox} />
                    <span className={styles.miniSum}>620 000,00</span>
                </span>
                <span className={styles.miniDoc} style={{ transform: 'rotate(1deg)' }}>
                    <b>Акт выполненных работ</b>
                    <span className={styles.line} style={{ width: '90%' }} />
                    <span className={styles.miniBox} />
                    <span className={styles.line} style={{ width: '60%' }} />
                </span>
                <span className={styles.miniDoc} style={{ transform: 'rotate(5deg)' }}>
                    <b>Доверенность</b>
                    <span className={styles.line} style={{ width: '90%' }} />
                    <span className={styles.line} style={{ width: '80%' }} />
                    <span className={styles.line} style={{ width: '60%' }} />
                    <span className={styles.miniStamp}>М.П.</span>
                </span>
            </span>
        </div>
    );
}

/**
 * Схема маршрута с карточкой рейса.
 *
 * Нарисована, а не живая карта: живая весила больше всей остальной страницы
 * и грузилась отдельно, а показать нужно одно — где машина на маршруте.
 */
export function RouteSketch() {
    return (
        <div className={styles.mapBox}>
            <svg
                role="img"
                aria-label="Карта маршрута Алматы — Тараз — Шымкент, машина между Алматы и Таразом"
                viewBox="0 0 900 620"
                preserveAspectRatio="xMidYMid slice"
                className={styles.mapSvg}
            >
                <path className={styles.mapRoad} d="M-20 120 C 200 140, 380 90, 560 130 S 820 110, 940 150" />
                <path className={styles.mapRoad} d="M-20 470 C 160 450, 300 500, 470 470 S 760 520, 940 480" />
                <path className={styles.mapRoad} d="M300 -20 C 320 140, 280 300, 330 420 S 360 560, 340 650" />
                <path className={styles.mapRoad} d="M690 -20 C 700 120, 660 260, 720 380 S 740 560, 760 650" />
                <path className={styles.mapAhead} d="M790 250 C 720 246, 660 300, 590 304 S 470 300, 430 322 S 250 372, 130 362" />
                <path className={styles.mapDone} d="M790 250 C 720 246, 660 300, 590 304" />
                <circle className={styles.mapFg} cx="790" cy="250" r="6" />
                <circle className={styles.mapMuted} cx="440" cy="318" r="4" />
                <circle className={styles.mapFinish} cx="130" cy="362" r="6" />
                <text className={styles.mapCity} x="806" y="246">Алматы</text>
                <text className={styles.mapTown} x="440" y="344" textAnchor="middle">Тараз</text>
                <text className={styles.mapCity} x="130" y="392" textAnchor="middle">Шымкент</text>
                <circle className={styles.mapFg} cx="590" cy="304" r="17" />
                <path className={styles.mapTruck} d="M582 298h9v9h-9zM591 301h4l3 3v3h-7z" />
            </svg>

            <div className={styles.tripCard} aria-hidden="true">
                <div className={styles.tripCardTop}>
                    <b>ЗК-2604</b>
                    <StatusPill status="IN_TRANSIT" />
                </div>
                <div className={styles.tripCardRoute}>Алматы → Шымкент</div>
                <div className={styles.tripCardGrid}>
                    <span>Транспорт</span><span>847 KZ 02</span>
                    <span>Водитель</span><span>Водитель А.</span>
                    <span>Видят</span><span>логист и заказчик</span>
                </div>
            </div>
        </div>
    );
}

/** Строка бумаги: серая полоска вместо текста. */
const Line = ({ w, mt }: { w: string; mt?: number }) => (
    <span className={styles.paperLine} style={{ width: w, marginTop: mt }} />
);

/**
 * Карточка рейса «Деньги и документы» и печатные формы веером.
 *
 * Формы нарисованы как настоящие: договор-заявка, доверенность, акт по
 * форме Р-1 и счёт на оплату. Их владелец отметил отдельно («прикольно»).
 */
export function TripDocuments() {
    return (
        <>
            <p className={styles.srOnly}>
                Картинка: карточка рейса ЗК-2604 Алматы — Шымкент. Ставка заказчика 620 000 тенге,
                ставка перевозчика 470 000 тенге, маржа 150 000 тенге. Документы по рейсу:
                договор-заявка, доверенность, счёт на оплату и акт выполненных работ.
            </p>
            <div className={styles.trip} aria-hidden="true">
                <div className={styles.tripHead}>
                    <b className={styles.tripNum}>ЗК-2604</b>
                    <span className={styles.dim}>Алматы → Шымкент · ТОО «Заказчик А»</span>
                    <span className={styles.tabs}>
                        <span>Основное</span>
                        <span className={styles.tabsOn}>Деньги и документы</span>
                        <span>Трекинг</span>
                    </span>
                </div>
                <div className={styles.tripBody}>
                    <div className={styles.tripMoney}>
                        <div className={styles.tripLabel}>Деньги по рейсу</div>
                        <span className={styles.tripRow}><span>Ставка заказчика</span><span>620 000&nbsp;₸</span></span>
                        <span className={styles.tripRow}><span>Ставка перевозчика</span><span>470 000&nbsp;₸</span></span>
                        <span className={`${styles.tripRow} ${styles.tripRowLast}`}><b>Маржа</b><b className={styles.pos}>150 000&nbsp;₸</b></span>
                        <div className={`${styles.tripLabel} ${styles.tripLabelDocs}`}>Документы</div>
                        {['Договор-заявка', 'Доверенность', 'Счёт на оплату АВ-00042', 'Акт выполненных работ'].map((d, i, all) => (
                            <span key={d} className={`${styles.tripRow} ${i === all.length - 1 ? styles.tripRowLast : ''}`}>
                                <span>{d}</span>
                                <span className={styles.pdf}>PDF</span>
                            </span>
                        ))}
                    </div>

                    <div className={styles.fan}>
                        <div className={styles.fanInner}>
                            <div className={styles.paper} style={{ left: '3%', top: 64, width: 214, height: 303, transform: 'rotate(-9deg)' }}>
                                <span className={styles.paperTitle}>ДОГОВОР-ЗАЯВКА № ЗК-2604</span>
                                <span className={styles.paperCity}><span>г. Алматы</span><span className={styles.paperLine} style={{ width: 60, marginTop: 3 }} /></span>
                                <Line w="96%" mt={4} />
                                <Line w="88%" />
                                <Line w="92%" />
                                <span className={styles.paperTable} style={{ gridTemplateColumns: '70px 1fr' }}>
                                    <span className={styles.th}>Маршрут</span><span>Алматы — Шымкент</span>
                                    <span className={styles.th}>Транспорт</span><span>847 KZ 02</span>
                                    <span className={styles.th}>Водитель</span><span>Водитель А.</span>
                                    <span className={styles.th}>Ставка</span><span>470 000 ₸</span>
                                </span>
                                <Line w="94%" mt={6} />
                                <Line w="84%" />
                                <Line w="90%" />
                                <Line w="60%" />
                                <span className={styles.signs}><span>Заказчик</span><span>Перевозчик</span></span>
                            </div>

                            <div className={styles.paper} style={{ left: '21%', top: 42, width: 214, height: 303, transform: 'rotate(-3deg)' }}>
                                <span className={styles.paperTitle}>ДОВЕРЕННОСТЬ № ЗК-2604</span>
                                <span className={styles.paperLine} style={{ width: '40%', alignSelf: 'center' }} />
                                <Line w="94%" mt={6} />
                                <Line w="86%" />
                                <span className={styles.paperText} style={{ marginTop: 4 }}><span className={styles.paperMuted}>Выдана: </span>Водитель А.</span>
                                <span className={styles.paperText}>Договор-заявка №ЗК-2604 Алматы — Шымкент</span>
                                <span className={styles.ruled}><span /><span /><span /><span /></span>
                                <Line w="80%" mt={6} />
                                <Line w="70%" />
                                <span className={styles.signs}><span>Руководитель</span><span className={styles.stamp}>М.П.</span></span>
                            </div>

                            <div className={styles.paper} style={{ left: '39%', top: 36, width: 220, height: 311, transform: 'rotate(3deg)', padding: '14px 15px' }}>
                                <span className={styles.formNo}>Форма Р-1</span>
                                <span className={styles.parties}>
                                    <span className={styles.paperMuted}>Заказчик</span><span className={styles.underline}>ТОО «Заказчик А»</span>
                                    <span className={styles.paperMuted}>Исполнитель</span><span className={styles.underline} style={{ height: 7 }} />
                                </span>
                                <span className={styles.actTitle}>АКТ ВЫПОЛНЕННЫХ РАБОТ<br />(ОКАЗАННЫХ УСЛУГ)</span>
                                <span className={`${styles.paperTable} ${styles.paperTableSm}`} style={{ gridTemplateColumns: '14px 1fr 30px 44px' }}>
                                    <span className={styles.thHead}>№</span><span className={styles.thHead}>Наименование работ (услуг)</span><span className={styles.thHead}>Кол-во</span><span className={styles.thHead}>Сумма</span>
                                    <span>1</span><span>Транспортные услуги Алматы — Шымкент</span><span>1</span><span>620 000,00</span>
                                    <span /><b>Итого</b><span /><b>620 000,00</b>
                                </span>
                                <Line w="92%" mt={8} />
                                <Line w="74%" />
                                <span className={styles.signs}><span>Сдал (Исполнитель)</span><span>Принял (Заказчик)</span><span className={styles.stamp}>М.П.</span></span>
                            </div>

                            <div className={styles.paper} style={{ left: '57%', top: 56, width: 232, height: 328, transform: 'rotate(8deg)', padding: 15, gap: 6 }}>
                                <span className={styles.bank}>
                                    <span>Бенефициар:<span className={styles.paperLine} style={{ width: '90%' }} />БИН/ИИН:<span className={styles.paperLine} style={{ width: '60%' }} /></span>
                                    <span>Банк бенефициара:<span className={styles.paperLine} style={{ width: '86%' }} /><span className={styles.paperLine} style={{ width: '50%' }} /></span>
                                </span>
                                <span className={styles.invoiceTitle}>Счёт на оплату № АВ-00042</span>
                                <span className={styles.rule} />
                                <span className={styles.paperText} style={{ display: 'flex', gap: 4 }}><span className={styles.paperMuted}>Поставщик:</span><span className={styles.paperLine} style={{ flex: 1, marginTop: 3 }} /></span>
                                <span className={styles.paperText}><span className={styles.paperMuted}>Покупатель: </span>ТОО «Заказчик А»</span>
                                <span className={`${styles.paperTable} ${styles.paperTableSm}`} style={{ gridTemplateColumns: '12px 1fr 24px 22px 44px 44px', marginTop: 4 }}>
                                    <span className={styles.thHead}>№</span><span className={styles.thHead}>Наименование</span><span className={styles.thHead}>Кол-во</span><span className={styles.thHead}>Ед.</span><span className={styles.thHead}>Цена</span><span className={styles.thHead}>Сумма</span>
                                    <span>1</span><span>Транспортные услуги Алматы — Шымкент</span><span>1</span><span>усл.</span><span>620 000,00</span><span>620 000,00</span>
                                </span>
                                <span className={styles.invoiceTotal}>Итого: 620 000,00</span>
                                <span className={styles.paperSmall}>Всего наименований 1, на сумму 620 000,00 KZT</span>
                                <span className={styles.signs}><span>Исполнитель</span><span className={styles.seal} /></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
