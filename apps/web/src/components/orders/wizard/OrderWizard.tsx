'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs, { type Dayjs } from 'dayjs';
import { Form, InputNumber, Modal, AutoComplete } from 'antd';
import { Check, ChevronsUpDown, CircleAlert, CircleCheck, Globe, Info, Plus, Trash2, Users } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Input as UiInput } from '@/components/ui/input';
import { FormSelect } from './FormSelect';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { MarginPreview } from '@/components/orders/MarginSummary';
import { TransportNumbers } from '@/components/orders/TransportNumbers';
import { api, Location } from '@/lib/api';
import { reportLoadFailure } from '@/lib/load';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import QuickCreateLocationModal from '@/components/ui/QuickCreateLocationModal';

interface Partner {
    id: string;
    name: string;
    isExternal?: boolean;
    isCustomer?: boolean;
    isCarrier?: boolean;
    /** По ним контрагента узнают в окне выбора: БИН, адрес, телефон, чей он. */
    bin?: string | null;
    address?: string | null;
    phone?: string | null;
    responsibleManagerId?: string | null;
    /** Условия расчётов из карточки: их заполнил бухгалтер. */
    vatPayer?: boolean | null;
    vatRate?: number | null;
    customerPaymentDays?: number | null;
    customerPaymentFrom?: string | null;
    carrierPaymentDays?: number | null;
    carrierPaymentFrom?: string | null;
    /** Отсрочка в банковских днях (F3). */
    customerPaymentBanking?: boolean;
    carrierPaymentBanking?: boolean;
}

import { RoutePointEmails, parseEmails } from '@/components/orders/RoutePointEmails';
import { moneyShort } from '@/lib/money-format';
import { AddressCombo, адресСтрокой } from '@/components/orders/new-order/AddressCombo';
import { BodySection, fmtT } from '@/components/orders/new-order/BodySection';
import { PackagingField, PlacesAndSize, SpecialConditions } from '@/components/orders/new-order/CargoExtras';
import { Header } from '@/components/orders/new-order/Header';
import { InlineCombo } from '@/components/orders/new-order/InlineCombo';
import { Summary, SubmitBlock, type SummaryItem, type SummaryStatus } from '@/components/orders/new-order/Summary';
import { Field, FieldError, SectionHead, Segmented } from '@/components/orders/new-order/ui';
import s from '@/components/orders/new-order/new-order.module.css';
import { customerAddressGroups, useCustomerAddressIds } from '@/lib/customer-addresses';
import { cn } from '@/lib/utils';
import { EMPTY_CARGO, totalPallets, type CargoState } from '@/lib/cargo';
import { toast } from 'sonner';
import { paymentTermsLabel, vatLabel } from '@/lib/settlement-terms';
import PartnerFormFields, { partnerFormToBody, подставитьПоБин, ОКНО_КОНТРАГЕНТА } from '@/components/partners/PartnerFormFields';
import CurrencySelect from '@/components/orders/CurrencySelect';
import { DateField } from '@/components/ui/DateField';
import { clearDraft, formValuesEmpty, readDraft, reviveFormValues, serializeFormValues, writeDraft } from '@/lib/form-draft';
import { NEW_DRIVER } from '@/components/orders/DriverPoolSelect';
import { DriverPicker } from '@/components/orders/DriverPicker';
import { PartnerPicker } from './PartnerPicker';
import { ExchangeOnBoardNote, publishNewOrder, useExchangeForNewOrder, useOrderExchangeState } from './ExchangeOption';
import { ChoiceField } from './ChoiceField';

/** Частые кузова — сверху окна выбора; остальные — поиском (M4). */
const FREQUENT_BODY = ['тент', 'рефрижератор', 'изотерм', 'бортовая'];
const BODY_TYPE_GROUPS = [
    { label: 'Частые', items: FREQUENT_BODY.map((t) => ({ id: t, title: t })) },
    {
        label: 'Все кузова',
        items: VEHICLE_TYPES.filter((t) => t !== 'не указан' && !FREQUENT_BODY.includes(t)).map((t) => ({ id: t, title: t })),
    },
];
import { DRIVER_CARD_FIELDS, alreadyExistsMessage, fetchDriverPool, tripVehicle, type PoolDriver } from '@/lib/driver-pool';

interface LocationState {
    city: string;
    address: string;
    id?: string;
    latitude?: number;
    longitude?: number;
    /** Почта, закреплённая за адресом: куда слать доверенность. */
    emails?: string[];
    /**
     * Дата точки (ISO) — у догрузок и выгрузок, необязательно (окно «Новая
     * заявка», 29.10.2026). У первой погрузки дата — поле формы `pickupDate`.
     */
    date?: string | null;
}

/** «1 заказчик», «3 заказчика», «18 заказчиков». */
const склон = (n: number, one: string, few: string, many: string) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
};

const MARKETPLACE_VALUE = '__MARKETPLACE__';
const MY_COMPANY_VALUE = '__MY_COMPANY__';

/**
 * Незаконченная новая заявка — всё, что набрано в мастере.
 *
 * Поля формы и то, что мастер держит отдельно от неё: стороны сделки,
 * маршрут, состав груза, выбранного водителя, шаг. Без любой из этих частей
 * восстановленная заявка оказалась бы наполовину пустой.
 */
interface ЧерновикЗаявки {
    step: number;
    myCompanyId: string;
    customer: string;
    carrier: string;
    responsible: string;
    driverId: string;
    showDims: boolean;
    cargo: CargoState;
    routePoints: Array<LocationState & { pointType: string }>;
    form: Record<string, unknown>;
}

/**
 * Сколько черновик живёт. Неделя — с запасом на «начал в пятницу, закончил
 * в понедельник»; черновик месячной давности скорее спутает, чем поможет.
 */
const СРОК_ЧЕРНОВИКА = 7 * 24 * 60 * 60 * 1000;

const когдаСохранён = (iso: string) => {
    const дата = dayjs(iso);
    return дата.isSame(dayjs(), 'day') ? `сегодня в ${дата.format('HH:mm')}` : дата.format('DD.MM в HH:mm');
};

// =================== ВИД ===================

/** Поле ввода shadcn в размер полей мастера. */
const FIELD = 'lc-ui-field h-8 rounded-lg text-[13px] md:text-[13px]';

type RoleTone = 'ok' | 'info' | 'warn' | 'muted';


export interface OrderWizardProps {
    /** Правка существующей заявки. */
    editId?: string | null;
    /** Новая заявка по образцу существующей («Копировать»). */
    fromId?: string | null;
    /** Заявка из запроса ставки. */
    quoteRequestId?: string | null;
    /** Закрыть мастер — набранное останется черновиком. */
    onClose: () => void;
    /** Новая заявка заведена. */
    onCreated: () => void;
    /** Правка сохранена. */
    onSaved: (orderId: string) => void;
    /** «Сбросить»: черновик стёрт — открыть мастер заново, с пустой формой. */
    onRestart: () => void;
    /** Заявка создана, окно ещё открыто (экран «Заявка создана») — обновить журнал под ним. */
    onRefresh?: () => void;
}

/**
 * Мастер заявки — окном поверх журнала (владелец, 08.10.2026), а не
 * отдельной страницей. Шаги те же: стороны и ставки, маршрут, груз.
 *
 * Вся логика — прежняя: проверки шагов, черновик в браузере, правка и
 * копирование, водитель и машина рейса, ставки и валюты. Поменялся вид —
 * как в макете «shadcn Nova». Контрагенты, водители, адреса — окном выбора
 * с поиском (владелец, 08.10.2026); менеджер и машина — окном, когда
 * список длинный. Валюта, характер груза и даты пока на Ant Design:
 * выглядят они так же, как остальные.
 */
export function OrderWizard({ editId: editIdProp, fromId: fromIdProp, quoteRequestId: quoteIdProp, onCreated, onSaved, onRestart, onRefresh }: OrderWizardProps) {
    const { user } = useAuthStore();
    const router = useRouter();
    const [form] = Form.useForm();
    const [quickPartnerForm] = Form.useForm();

    // Wizard step
    const [currentStep, setCurrentStep] = useState(0);

    // Data
    const [locations, setLocations] = useState<Location[]>([]);
    /** Адреса из последних заявок компании — в окне выбора первой группой. */
    const [recentLocationIds, setRecentLocationIds] = useState<string[]>([]);
    const [fetchedPartners, setFetchedPartners] = useState<Partner[]>([]);
    // Пока список не пришёл, в выпадашке только своя компания — без
    // подсказки это выглядит как «контрагентов нет».
    const [партнёрыГрузятся, setПартнёрыГрузятся] = useState(true);
    /**
     * Стороны загруженной заявки — отдельно от справочника.
     *
     * В списке выбора только партнёрства платформы и справочник
     * контрагентов. Компания, с которой рейс уже сделан, может не оказаться
     * ни там, ни там — например, приглашение на платформе так и не приняли.
     * Тогда её id не находился в списке, поле оставалось пустым, а форма
     * отвечала «Укажите заказчика» по заявке, где он есть.
     *
     * Список именно вычисляемый, а не досбор в состоянии: справочник
     * догружается сам по себе и раньше затирал дособранное, а правка
     * успевала спросить про заказчика по неполному списку и решить, что
     * его нет.
     */
    const [orderParties, setOrderParties] = useState<Partner[]>([]);
    const partners = useMemo<Partner[]>(() => {
        if (!orderParties.length) return fetchedPartners;
        const known = new Set(fetchedPartners.map((p) => p.id));
        const add = orderParties.filter((p) => !known.has(p.id));
        return add.length ? [...fetchedPartners, ...add] : fetchedPartners;
    }, [fetchedPartners, orderParties]);
    const [cargoCategories, setCargoCategories] = useState<any[]>([]);
    const [profileComplete, setProfileComplete] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [myCompanyName, setMyCompanyName] = useState('');
    const [myCompanies, setMyCompanies] = useState<any[]>([]);
    const [selectedMyCompanyId, setSelectedMyCompanyId] = useState<string>('');

    // Driver & vehicle selection
    const [drivers, setDrivers] = useState<PoolDriver[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [selectedDriverId, setSelectedDriverId] = useState<string>('');
    /**
     * Водитель и машина правимой заявки, как они записаны в ней самой.
     *
     * Машина рейса живёт в заявке: водитель мог с тех пор пересесть на
     * другую, и в форме правки должна стоять та, на которой едут в этом
     * рейсе, а не последняя из его карточки.
     */
    const [рейсПравки, setРейсПравки] = useState<{ driverId: string; plate: string | null; trailer: string | null } | null>(null);
    const формаВодителяЗаполнена = useRef(false);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [vehiclesLoading, setVehiclesLoading] = useState(false);
    /** Какая машина выбрана в поле «Машина из автопарка» — только чтобы показать её. */
    const [машинаИзПарка, setМашинаИзПарка] = useState<string | undefined>();

    // Parties
    const [selectedCustomer, setSelectedCustomer] = useState<string>('');
    const [selectedCarrier, setSelectedCarrier] = useState<string>('');
    /** Адреса из заявок выбранного заказчика — в окне адреса только его адреса (владелец, 29.10.2026). */
    const customerAddressIds = useCustomerAddressIds(
        selectedCustomer === MY_COMPANY_VALUE ? selectedMyCompanyId : selectedCustomer || null,
    );

    // Ответственный менеджер от нашей компании: SELF — я, NONE — не назначать, иначе userId
    const [responsibleChoice, setResponsibleChoice] = useState<string>('SELF');
    const [officeUsers, setOfficeUsers] = useState<{ id: string; firstName: string; lastName: string; role: string }[]>([]);
    const [quickPartnerTarget, setQuickPartnerTarget] = useState<'CUSTOMER' | 'CARRIER' | null>(null);
    // Справочники условий и форм оплаты (для заявки)

    const isOwnOrExternalCarrier = selectedCarrier === MY_COMPANY_VALUE || 
        (selectedCarrier && partners.find(p => p.id === selectedCarrier)?.isExternal === true);

    const isCarrierOnPlatform = selectedCarrier && selectedCarrier !== MY_COMPANY_VALUE && selectedCarrier !== MARKETPLACE_VALUE && !partners.find(p => p.id === selectedCarrier)?.isExternal;

    // Водители — общей базой компании, а не списком выбранного перевозчика:
    // тот, кто вчера ехал от другого ИП, сегодня может ехать от этого. База
    // одна на всю форму, поэтому грузим её один раз, а не на каждый выбор
    // перевозчика.
    useEffect(() => {
        if (!user || !isOwnOrExternalCarrier || drivers.length || driversLoading) return;
        setDriversLoading(true);
        fetchDriverPool()
            .then(setDrivers)
            .catch(() => toast.error('Ошибка загрузки водителей'))
            .finally(() => setDriversLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, isOwnOrExternalCarrier]);

    useEffect(() => {
        if (selectedCarrier === MY_COMPANY_VALUE) {
            setVehiclesLoading(true);
            api.get('/company/vehicles', { params: { companyId: selectedMyCompanyId } })
                .then(res => setVehicles(res.data))
                .catch(() => toast.error('Ошибка загрузки автопарка'))
                .finally(() => setVehiclesLoading(false));
        } else {
            setVehicles([]);
        }
    }, [selectedCarrier, partners, user, selectedMyCompanyId]);

    const handleDriverSelect = (value: string) => {
        setSelectedDriverId(value);
        if (value === NEW_DRIVER) {
            form.setFieldsValue({
                firstName: '', lastName: '', middleName: '', phone: '', iin: '',
                vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
                docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: ''
            });
        } else {
            const d = drivers.find(drv => drv.id === value);
            if (d) {
                // Правим рейс с тем же водителем — машина из заявки: она
                // этого рейса. Из карточки — только его последняя.
                const машинаРейса = рейсПравки?.driverId === d.id && рейсПравки.plate ? рейсПравки : null;
                form.setFieldsValue({
                    firstName: d.firstName,
                    lastName: d.lastName,
                    middleName: d.middleName || '',
                    phone: d.phone,
                    iin: d.iin || '',
                    vehicleType: d.vehicleType || undefined,
                    vehicleModel: d.vehicleModel || '',
                    vehiclePlate: (машинаРейса ? машинаРейса.plate : d.vehiclePlate) || '',
                    trailerNumber: (машинаРейса ? машинаРейса.trailer : d.trailerNumber) || '',
                    docType: d.docType || undefined,
                    docNumber: d.docNumber || '',
                    docIssuedAt: d.docIssuedAt ? dayjs(d.docIssuedAt) : null,
                    docExpiresAt: d.docExpiresAt ? dayjs(d.docExpiresAt) : null,
                    docIssuedBy: d.docIssuedBy || '',
                });
            }
        }
    };

    // Правка заявки: водитель выбран ещё при заведении — показываем его
    // данные, как только пришла база. Раньше в форме правки стояли пустые
    // поля, и было не понять, кто и на какой машине едет.
    useEffect(() => {
        if (формаВодителяЗаполнена.current || !рейсПравки || !drivers.length) return;
        if (!drivers.some((d) => d.id === рейсПравки.driverId)) return;
        формаВодителяЗаполнена.current = true;
        form.setFieldsValue({ driverId: рейсПравки.driverId });
        handleDriverSelect(рейсПравки.driverId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drivers, рейсПравки]);

    const handleVehicleSelect = (value: string) => {
        const v = vehicles.find(veh => veh.id === value);
        if (v) {
            form.setFieldsValue({
                vehicleType: v.type,
                vehicleModel: v.model,
                vehiclePlate: v.plate,
                trailerNumber: v.trailerNumber || '',
            });
        }
    };

    // Route points
    // Состав груза: паллеты списком, способ погрузки и упаковка.
    const [cargo, setCargo] = useState<CargoState>(EMPTY_CARGO);

    const [routePointsState, setRoutePointsState] = useState<Array<LocationState & { pointType: string }>>([
        { city: '', address: '', pointType: 'PICKUP' },
        { city: '', address: '', pointType: 'DELIVERY' }
    ]);



    const isMeCustomer = selectedCustomer === MY_COMPANY_VALUE;
    /**
     * Как выбранный заказчик называет свой номер перевозки.
     *
     * Пусто — графа так и называется «ID» и работает: раньше
     * без этой настройки её просто не было, и о ней надо было догадаться.
     */
    const customerRefLabel = isMeCustomer
        ? null
        : (partners.find(p => p.id === selectedCustomer) as any)?.customerRefLabel || null;
    /** Переименовать графу можно только контрагенту из справочника — он наш. */
    const selectedCustomerIsExternal = !isMeCustomer
        && !!(partners.find(p => p.id === selectedCustomer) as any)?.isExternal;
    const isMeCarrier = selectedCarrier === MY_COMPANY_VALUE;
    const isMarketplace = selectedCarrier === MARKETPLACE_VALUE;

    // «Найти перевозчика на бирже» (владелец, 10.10.2026) — от лица текущей
    // организации: выставляет на биржу она, и заявку от другой своей
    // организации сервер ей выставить не даст. В правке (15.10.2026) — если
    // заявка ещё не на бирже и биржа её примет (нет исполнителя, не в работе).
    const exchangeEnabled = useExchangeForNewOrder();
    const editExchange = useOrderExchangeState(editIdProp && exchangeEnabled ? editIdProp : null);
    /** Правка заявки, которая уже на бирже: перевозчика выберут из откликов. */
    const alreadyOnExchange = !!editIdProp && !!editExchange?.onExchange;
    const exchangeAvailable = exchangeEnabled && selectedMyCompanyId === user?.companyId
        && (!editIdProp || (!!editExchange && !editExchange.onExchange && editExchange.canPublish));
    const exchangeChecked = Form.useWatch('onExchange', { form, preserve: true }) === true;
    /** «Без цены» на бирже (задачи шефа, P4): исполнители предложат свою. */
    const [exchangeNoPrice, setExchangeNoPrice] = useState(false);
    /** Выставить на биржу при сохранении: в заявке перевозчиком записана наша компания, водителя нет. */
    const exchangeActive = exchangeAvailable && exchangeChecked && isMeCarrier;
    /**
     * Перевозчика ищут на бирже — сейчас или уже. Пока его не выбрали, в поле
     * «Перевозчик» нет нашей компании, а водителя не спрашиваем.
     */
    const searchingOnExchange = exchangeActive || alreadyOnExchange;
    const toggleExchange = (on: boolean) => {
        form.setFieldValue('onExchange', on);
        // Как при выборе перевозчика в поле: прежний водитель к новому выбору не относится.
        setSelectedCarrier(on ? MY_COMPANY_VALUE : '');
        setSelectedDriverId('');
        form.setFieldsValue({
            driverId: undefined,
            lastName: '', firstName: '', middleName: '', phone: '', iin: '',
            vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
            docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: ''
        });
    };

    // На бирже «Ставка» своей же компании-заказчику смысла не имеет — нужна
    // только цена для исполнителя; ставка от внешнего заказчика остаётся.
    const showCustomerPriceField = searchingOnExchange ? !isMeCustomer : (!isMeCustomer || (isMeCustomer && isMeCarrier));
    const showDriverCostField = (isMeCustomer && !isMeCarrier) || (!isMeCustomer && !isMeCarrier);

    // Знак валюты из подписи убран: валюта теперь выбирается рядом с суммой
    // и может быть не тенге.
    const customerPriceLabel = (isMeCustomer && isMeCarrier) ? "Ставка" : "Ставка от заказчика";
    const driverCostLabel = isMarketplace ? "Ставка для биржи" : "Ставка перевозчику";

    // Габариты груза (по галочке)
    const [showDims, setShowDims] = useState(false);

    // Tariff
    const [appliedTariff, setAppliedTariff] = useState<any>(null);

    // Quick partner modal
    const [quickPartnerModalOpen, setQuickPartnerModalOpen] = useState(false);
    const [quickPartnerLoading, setQuickPartnerLoading] = useState(false);

    // Quick create location modal
    const [quickLocationModalOpen, setQuickLocationModalOpen] = useState(false);
    const [activeRoutePointIndex, setActiveRoutePointIndex] = useState<number | null>(null);

    const handleNewLocationSuccess = async (newLoc: Location) => {
        setQuickLocationModalOpen(false);
        await fetchLocations();

        if (activeRoutePointIndex !== null) {
            const newPts = [...routePointsState];
            newPts[activeRoutePointIndex] = {
                ...newPts[activeRoutePointIndex],
                city: newLoc.city || '',
                address: newLoc.address,
                id: newLoc.id,
                latitude: newLoc.latitude,
                longitude: newLoc.longitude,
                // Почты, которые вписали в новый адрес, — сразу в точку (доверенность уйдёт туда).
                emails: parseEmails(newLoc.emails),
            };
            setRoutePointsState(newPts);

            // Trigger tariff check
            const firstPickup = newPts.find(p => p.pointType === 'PICKUP');
            const lastDelivery = [...newPts].reverse().find(p => p.pointType === 'DELIVERY');
            if (firstPickup?.city && lastDelivery?.city) {
                lookupTariff(firstPickup.city, lastDelivery.city);
            }
        }
        setActiveRoutePointIndex(null);
    };

    useEffect(() => {
        api.get('/company/profile-status').then(res => {
            setProfileComplete(res.data.isComplete);
        }).catch(() => {});
        api.get('/company/my-companies').then(res => {
            const list = res.data || [];
            setMyCompanies(list);
            // Организацию из восстановленного черновика не перебиваем: список
            // приходит позже, чем черновик подставлен.
            if (user?.companyId) {
                const своя = user.companyId;
                setSelectedMyCompanyId((prev) => prev || своя);
            } else if (list.length > 0) {
                setSelectedMyCompanyId((prev) => prev || list[0].id);
            }
        }).catch(() => {});
        fetchLocations();
        fetchCargoTypes();
        fetchPartners();
        api.get('/company/managers')
            .then(res => setOfficeUsers(res.data || []))
            .catch(() => { });
    }, [user]);

    /**
     * Одна форма на заведение, дублирование и правку.
     *
     * `?from=<id>` — скопировать данные в новую заявку, `?edit=<id>` —
     * править существующую. Отдельного окна правки больше нет: оно было
     * второй формой той же заявки, с урезанным набором полей и вопросом
     * «Ваша роль в этой сделке», которого у существующего рейса быть не
     * может — роль там уже сыграна. Две формы неизбежно расходились, и
     * правка отставала от заведения.
     */
    const duplicateLoadedRef = useRef(false);
    const [pendingParties, setPendingParties] = useState<{ customer?: string; carrier?: string } | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingNumber, setEditingNumber] = useState<string>('');

    useEffect(() => {
        if (duplicateLoadedRef.current) return;
        const editId = editIdProp || null;
        const fromId = editId || fromIdProp || null;
        if (!fromId) return;
        duplicateLoadedRef.current = true;

        (async () => {
            try {
                const [orderRes, myRes] = await Promise.all([
                    api.get(`/orders/${fromId}`),
                    api.get('/company/my-companies'),
                ]);
                const o = orderRes.data;
                const myIds = new Set<string>((myRes.data || []).map((c: any) => c.id));

                if (o.cargoLength != null || o.cargoWidth != null || o.cargoHeight != null) {
                    setShowDims(true);
                }
                form.setFieldsValue({
                    natureOfCargo: o.natureOfCargo || undefined,
                    cargoDescription: o.cargoDescription || undefined,
                    ttnNumber: o.ttnNumber || undefined,
                    customerRefNumber: o.customerRefNumber || undefined,
                    cargoWeight: o.cargoWeight ?? undefined,
                    cargoVolume: o.cargoVolume ?? undefined,
                    cargoLength: o.cargoLength ?? undefined,
                    cargoWidth: o.cargoWidth ?? undefined,
                    cargoHeight: o.cargoHeight ?? undefined,
                    palletCount: o.palletCount ?? undefined,
                    cargoType: o.cargoType || undefined,
                    requirements: o.requirements || undefined,
                    customerPrice: o.customerPrice ?? undefined,
                    driverCost: (o.subForwarderPrice ?? o.driverCost) ?? undefined,
                    vatRate: o.vatRate ?? undefined,
                    hasVat: o.hasVat ?? undefined,
                    executorVatRate: o.executorVatRate ?? undefined,
                    executorHasVat: o.executorHasVat ?? undefined,
                });

                setCargo({
                    pallets: Array.isArray(o.pallets) ? o.pallets : [],
                    loadingTypes: o.loadingTypes || [],
                    packagingTypes: o.packagingTypes || [],
                });

                if (Array.isArray(o.routePoints) && o.routePoints.length > 0) {
                    setRoutePointsState(o.routePoints.map((rp: any) => ({
                        id: rp.locationId || rp.location?.id,
                        city: rp.location?.city || '',
                        address: rp.location?.address || '',
                        latitude: rp.location?.latitude,
                        longitude: rp.location?.longitude,
                        pointType: rp.pointType,
                        emails: parseEmails(rp.location?.emails),
                        date: rp.pointType !== 'PICKUP' && rp.expectedDate ? dayjs(rp.expectedDate).toISOString() : null,
                    })));
                }

                // Стороны сделки относительно моих организаций
                const customer = o.customerCompanyId
                    ? (myIds.has(o.customerCompanyId) ? MY_COMPANY_VALUE : o.customerCompanyId)
                    : undefined;
                let carrier: string | undefined;
                if (o.subForwarderId && !myIds.has(o.subForwarderId)) {
                    carrier = o.subForwarderId;
                } else if (o.forwarderId) {
                    carrier = myIds.has(o.forwarderId) ? MY_COMPANY_VALUE : o.forwarderId;
                }
                // Стороны самой заявки — в список выбора (см. `orderParties`).
                setOrderParties([o.customerCompany, o.subForwarder, o.partner, o.forwarder]
                    .filter((c: any) => c?.id && c?.name)
                    .map((c: any) => ({
                        id: c.id,
                        name: c.name,
                        isExternal: !!c.isExternal,
                        isCustomer: true,
                        isCarrier: true,
                    })) as Partner[]);

                setPendingParties({ customer, carrier });

                if (editId) {
                    setEditingId(editId);
                    setEditingNumber(o.orderNumber || '');
                    // При дублировании дату намеренно не переносят — рейс
                    // новый. При правке она часть заявки и должна стоять.
                    const pickup = (o.routePoints || []).find((rp: any) => rp.pointType === 'PICKUP');
                    if (pickup?.expectedDate) {
                        form.setFieldsValue({ pickupDate: dayjs(pickup.expectedDate) });
                    }
                    if (o.driverId) {
                        setSelectedDriverId(o.driverId);
                        setРейсПравки({
                            driverId: o.driverId,
                            plate: o.assignedDriverPlate || null,
                            trailer: o.assignedDriverTrailer || null,
                        });
                    }
                } else {
                    toast.success(`Скопированы данные заявки ${o.orderNumber}. Проверьте и укажите дату погрузки.`);
                }
            } catch {
                toast.error(editId
                    ? 'Не удалось загрузить заявку для правки'
                    : 'Не удалось загрузить заявку для дублирования');
            }
        })();
    }, []);

    // Стороны применяем после загрузки списка контрагентов (иначе в селекте показался бы «сырой» id)
    useEffect(() => {
        if (!pendingParties) return;
        const needsPartners = (v?: string) => !!v && v !== MY_COMPANY_VALUE;
        if ((needsPartners(pendingParties.customer) || needsPartners(pendingParties.carrier)) && partners.length === 0) return;
        const resolve = (v?: string) => (!v || v === MY_COMPANY_VALUE || partners.some(p => p.id === v)) ? v : undefined;
        const cust = resolve(pendingParties.customer);
        const carr = resolve(pendingParties.carrier);
        if (cust) setSelectedCustomer(cust);
        if (carr) setSelectedCarrier(carr);
        setPendingParties(null);
    }, [pendingParties, partners]);

    // =================== ЧЕРНОВИК НОВОЙ ЗАЯВКИ ===================
    //
    // Начал заводить заявку, отошёл в другой раздел — проверить контрагента,
    // завести адрес, — вернулся, а набранного нет. Теперь мастер сам
    // сохраняет незаконченную заявку в браузере и при возвращении подставляет
    // её обратно. После создания заявки черновик стирается.
    //
    // Только у новой заявки. У правки источник — сама заявка на сервере, у
    // дубля — заявка-образец: подставить поверх них старый черновик значило
    // бы перепутать, что сейчас правят.

    const черновикКлюч = user?.id && user?.companyId ? `lc:order-draft:v1:${user.id}:${user.companyId}` : null;
    /** Когда был сохранён черновик, который подставили при открытии. */
    const [черновикОт, setЧерновикОт] = useState<string | null>(null);
    /** Когда черновик сохранился в последний раз — чтобы человек видел, что он есть. */
    const [черновикСохранён, setЧерновикСохранён] = useState<string | null>(null);
    /** Решение «подставлять или нет» принято: до него сохранять нельзя — затрём черновик пустой формой. */
    const черновикГотов = useRef(false);
    /** Заявка создана или начата заново: больше не сохраняем. */
    const черновикЗакрыт = useRef(false);
    /** Как форма выглядела при открытии — от этого считаем, введено ли что-нибудь. */
    const начальныеПоля = useRef<Record<string, unknown>>({});
    /** Человек что-то поменял в полях формы — повод сохранить. */
    const [правкаФормы, setПравкаФормы] = useState(0);

    useEffect(() => {
        if (!черновикКлюч || черновикГотов.current) return;
        if (editIdProp || fromIdProp || quoteIdProp) return;

        начальныеПоля.current = serializeFormValues(form.getFieldsValue(true));
        const черновик = readDraft<ЧерновикЗаявки>(черновикКлюч, СРОК_ЧЕРНОВИКА);
        if (черновик) {
            const d = черновик.data;
            form.setFieldsValue(reviveFormValues(d.form || {}));
            if (Array.isArray(d.routePoints) && d.routePoints.length) setRoutePointsState(d.routePoints);
            if (d.cargo) setCargo({ ...EMPTY_CARGO, ...d.cargo });
            setShowDims(!!d.showDims);
            if (d.responsible) setResponsibleChoice(d.responsible);
            if (d.myCompanyId) setSelectedMyCompanyId(d.myCompanyId);
            if (d.driverId) setSelectedDriverId(d.driverId);
            // Стороны — тем же путём, что у дубля: после загрузки справочника,
            // иначе в поле показался бы голый код.
            if (d.customer || d.carrier) {
                setPendingParties({ customer: d.customer || undefined, carrier: d.carrier || undefined });
            }
            setCurrentStep(Math.min(Math.max(Number(d.step) || 0, 0), 2));
            setЧерновикОт(черновик.savedAt);
            setЧерновикСохранён(черновик.savedAt);
        }
        черновикГотов.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [черновикКлюч]);

    /**
     * Записать черновик сейчас — по тому, что на экране в эту минуту.
     *
     * Функция обновляется на каждой отрисовке (ссылка держит последнюю): её
     * зовут и отложенно, пока человек печатает, и в момент ухода со
     * страницы — тогда отложенного сохранения уже не дождаться.
     */
    const сохранитьЧерновик = useRef<() => void>(() => { });
    сохранитьЧерновик.current = () => {
        if (!черновикКлюч || editingId || !черновикГотов.current || черновикЗакрыт.current) return;
        const снимок: ЧерновикЗаявки = {
            step: currentStep,
            myCompanyId: selectedMyCompanyId,
            // Пока стороны черновика ждут справочник, в состоянии их ещё
            // нет — берём их оттуда, иначе сохранение затёрло бы их пустыми.
            customer: pendingParties?.customer ?? selectedCustomer,
            carrier: pendingParties?.carrier ?? selectedCarrier,
            responsible: responsibleChoice,
            driverId: selectedDriverId,
            showDims,
            cargo,
            routePoints: routePointsState,
            form: serializeFormValues(form.getFieldsValue(true)),
        };
        const естьТочки = снимок.routePoints.some((p) => p.id || p.city || p.address);
        const естьГруз = cargo.pallets.length > 0 || cargo.loadingTypes.length > 0 || cargo.packagingTypes.length > 0
            || [cargo.placesCount, cargo.stackable, cargo.tempMin, cargo.tempMax, cargo.adr, cargo.adrClass, cargo.cargoValue]
                .some((v) => v !== undefined && v !== null && v !== '');
        const пусто = !снимок.customer && !снимок.carrier && !снимок.driverId && !естьТочки && !естьГруз
            && formValuesEmpty(снимок.form, начальныеПоля.current);
        if (пусто) {
            clearDraft(черновикКлюч);
            setЧерновикСохранён(null);
            return;
        }
        const когда = writeDraft(черновикКлюч, снимок);
        if (когда) setЧерновикСохранён(когда);
    };

    // Пока печатают — с небольшой задержкой, чтобы не писать на каждую букву.
    useEffect(() => {
        if (!черновикКлюч || editingId || !черновикГотов.current || черновикЗакрыт.current) return;
        const таймер = window.setTimeout(() => сохранитьЧерновик.current(), 400);
        return () => window.clearTimeout(таймер);
    }, [черновикКлюч, editingId, currentStep, selectedMyCompanyId, selectedCustomer, selectedCarrier, pendingParties,
        responsibleChoice, selectedDriverId, showDims, cargo, routePointsState, правкаФормы]);

    // Уходят со страницы — записываем сразу: вбил ставку и тут же нажал на
    // другой раздел, а отложенное сохранение не успело. То же при закрытии
    // вкладки и перезагрузке.
    useEffect(() => {
        const сразу = () => сохранитьЧерновик.current();
        window.addEventListener('pagehide', сразу);
        return () => {
            window.removeEventListener('pagehide', сразу);
            сразу();
        };
    }, []);

    /** Забыть черновик и открыть пустую форму. */
    const начатьЗаново = () => {
        черновикЗакрыт.current = true;
        if (черновикКлюч) clearDraft(черновикКлюч);
        // Мастер открывается заново целиком, а не сброс полей по одному: у
        // него десяток кусков состояния, и забытый кусок дал бы наполовину
        // пустую форму.
        onRestart();
    };

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch (e: any) { reportLoadFailure('справочник адресов', e); }
        // «Недавние» — удобство, а не данные заявки: не загрузились — окно
        // просто без этой группы, отдельной ошибки человеку не нужно.
        api.get('/locations/recent').then((r) => setRecentLocationIds(r.data || [])).catch(() => setRecentLocationIds([]));
    };

    const fetchCargoTypes = async () => {
        try {
            const response = await api.get('/cargo-types');
            setCargoCategories(response.data);
        } catch (e: any) { reportLoadFailure('виды груза', e); }
    };

    const fetchPartners = async () => {
        try {
            const [partnersRes, externalRes, profileRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
                api.get('/company/profile'),
            ]);
            // Зарегистрированные партнёры могут выступать и заказчиком, и перевозчиком
            const partnersList = partnersRes.data.map((p: any) => ({
                ...p,
                isExternal: false,
                isCustomer: p.isCustomer ?? true,
                isCarrier: p.isCarrier ?? true,
            }));
            // Офлайн-контрагенты — по своим ролям (заказчик/перевозчик), как заведены
            const externalList = externalRes.data.map((e: any) => ({
                id: e.id,
                name: e.name,
                isExternal: true,
                isCustomer: !!e.isCustomer,
                isCarrier: !!e.isCarrier,
                // По ним контрагента узнают и ищут в окне выбора: названий
                // «ТОО Транс» бывает несколько, БИН — один.
                bin: e.bin ?? null,
                address: e.address ?? null,
                phone: e.phone ?? null,
                responsibleManagerId: e.responsibleManagerId ?? null,
                // Как заказчик называет свой номер перевозки. Без этого поля
                // графа в заявке не появлялась вовсе: список контрагентов
                // пересобирался по нескольким полям, и настройка терялась
                // по дороге.
                customerRefLabel: e.customerRefLabel ?? null,
                // Условия расчётов: по ним в мастере видно, с НДС контрагент
                // или без и когда он платит. Спрашивать это у логиста больше
                // не нужно — ответ уже есть в карточке.
                vatPayer: e.vatPayer ?? null,
                vatRate: e.vatRate ?? null,
                customerPaymentDays: e.customerPaymentDays ?? null,
                customerPaymentFrom: e.customerPaymentFrom ?? null,
                carrierPaymentDays: e.carrierPaymentDays ?? null,
                carrierPaymentFrom: e.carrierPaymentFrom ?? null,
                customerPaymentBanking: !!e.customerPaymentBanking,
                carrierPaymentBanking: !!e.carrierPaymentBanking,
            }));
            const combined = [...partnersList, ...externalList];
            setFetchedPartners(combined);
            if (profileRes.data?.name) {
                setMyCompanyName(profileRes.data.name);
            }
        } catch (e: any) { reportLoadFailure('список контрагентов', e); }
        finally { setПартнёрыГрузятся(false); }
    };

    /**
     * Условия расчётов выбранных сторон — из их карточек.
     *
     * Своя компания карточкой не является: с самим собой не рассчитываются.
     */
    const termsOf = (id: string) => (
        !id || id === MY_COMPANY_VALUE || id === MARKETPLACE_VALUE
            ? null
            : partners.find((p) => p.id === id) ?? null
    );
    const customerTerms = termsOf(selectedCustomer);
    const carrierTerms = termsOf(selectedCarrier);

    // Location options grouped by company
    const getLocationOptions = () => {
        if (!locations || locations.length === 0) return [];
        const customerCompanyId = selectedCustomer === MY_COMPANY_VALUE ? selectedMyCompanyId : selectedCustomer;
        const carrierCompanyId = selectedCarrier === MY_COMPANY_VALUE ? selectedMyCompanyId : 
            (selectedCarrier === MARKETPLACE_VALUE || !selectedCarrier) ? undefined : selectedCarrier;

        const currentMyName = myCompanies.find(c => c.id === selectedMyCompanyId)?.name?.trim() || myCompanyName;
        const customerName = selectedCustomer === MY_COMPANY_VALUE ? currentMyName : partners.find(p => p.id === selectedCustomer)?.name || 'Заказчик';
        const carrierName = selectedCarrier === MY_COMPANY_VALUE ? currentMyName : partners.find(p => p.id === selectedCarrier)?.name || 'Перевозчик';

        // Заказчик выбран — только его адреса: привязанные к нему и из его
        // заявок. Адресов других заказчиков здесь нет (владелец, 29.10.2026).
        if (customerCompanyId) {
            return customerAddressGroups(
                locations,
                { id: customerCompanyId, name: customerName },
                customerAddressIds ?? [],
                carrierCompanyId ? { id: carrierCompanyId, name: carrierName } : null,
            );
        }

        const customerLocs = locations.filter(l => customerCompanyId && (l as any).companyId === customerCompanyId);
        const carrierLocs = locations.filter(l => carrierCompanyId && (l as any).companyId === carrierCompanyId);
        const categorizedIds = new Set([...customerLocs.map(l => l.id), ...carrierLocs.map(l => l.id)]);
        const otherLocs = locations.filter(l => !categorizedIds.has(l.id));

        const groups: Array<{ label: string; options: Location[] }> = [];

        // Частое — сверху (правило владельца от 27.07): адреса из последних
        // заявок. Они же остаются в своих группах ниже — поиск и фильтр по
        // контрагенту находят их и там.
        const recentLocs = recentLocationIds
            .map((id) => locations.find((l) => l.id === id))
            .filter((l): l is Location => !!l);
        if (recentLocs.length > 0) {
            groups.push({ label: 'Недавние', options: recentLocs });
        }

        if (customerLocs.length > 0) {
            const currentMyCompanyName = myCompanies.find(c => c.id === selectedMyCompanyId)?.name || myCompanyName;
            const name = selectedCustomer === MY_COMPANY_VALUE ? currentMyCompanyName : partners.find(p => p.id === selectedCustomer)?.name || 'Заказчик';
            groups.push({ label: `Склады заказчика [${name}]`, options: customerLocs });
        }
        if (carrierLocs.length > 0) {
            const name = selectedCarrier === MY_COMPANY_VALUE ? (myCompanies.find(c => c.id === selectedMyCompanyId)?.name?.trim() || myCompanyName) : partners.find(p => p.id === selectedCarrier)?.name || 'Перевозчик';
            groups.push({ label: `Склады перевозчика [${name}]`, options: carrierLocs });
        }
        if (otherLocs.length > 0) {
            groups.push({ label: 'Все остальные адреса', options: otherLocs });
        }
        return groups;
    };

    const lookupTariff = async (originCity: string, destCity: string) => {
        if (!originCity || !destCity) { setAppliedTariff(null); return; }
        try {
            const response = await api.get('/contracts/tariff-lookup', {
                params: { originCity, destinationCity: destCity }
            });
            if (response.data?.price) {
                setAppliedTariff(response.data);
                if (showCustomerPriceField) {
                    form.setFieldsValue({ customerPrice: response.data.price });
                } else {
                    form.setFieldsValue({ driverCost: response.data.price });
                }
                toast.success(`Тариф найден: ${response.data.price.toLocaleString('ru-RU')} ₸`);
            } else { setAppliedTariff(null); }
        } catch { setAppliedTariff(null); }
    };

    /** Открыть заведение контрагента с ролью того списка, откуда нажали. */
    const открытьЗаведениеКонтрагента = (роль: 'CUSTOMER' | 'CARRIER') => {
        setQuickPartnerTarget(роль);
        quickPartnerForm.resetFields();
        quickPartnerForm.setFieldsValue({
            roles: [роль === 'CUSTOMER' ? 'customer' : 'carrier'],
        });
        setQuickPartnerModalOpen(true);
    };

    /**
     * Завести контрагента, не выходя из мастера.
     *
     * Роль берётся из галочек в окне. Раньше проставлялись обе сразу, кто
     * бы что ни заводил: фирма, которую вбили как перевозчика, появлялась
     * и в списке заказчиков. Окно открывается с отмеченной ролью того
     * списка, из которого нажали, — а поправить её можно тут же.
     *
     * Подставляем нового контрагента в тот список, откуда пришли, только
     * если роль ему оставили. Иначе его в этом списке нет, и выбор был бы
     * пустым местом.
     */
    const handleCreateQuickPartner = async (values: any) => {
        setQuickPartnerLoading(true);
        try {
            const res = await api.post('/external-companies', partnerFormToBody(values));
            toast.success('Контрагент добавлен');
            setQuickPartnerModalOpen(false);
            quickPartnerForm.resetFields();
            await fetchPartners();
            if (quickPartnerTarget === 'CUSTOMER' && res.data.isCustomer) {
                setSelectedCustomer(res.data.id);
            } else if (quickPartnerTarget === 'CARRIER' && res.data.isCarrier) {
                setSelectedCarrier(res.data.id);
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка при создании контрагента');
        } finally {
            setQuickPartnerLoading(false);
            setQuickPartnerTarget(null);
        }
    };

    // Determine role description for the user
    const getRoleDescription = (): { text: string; tone: RoleTone } => {
        if (searchingOnExchange) {
            if (isMeCustomer) return { text: 'Вы — заказчик. Перевозчика найдёте на бирже', tone: 'info' };
            return selectedCustomer
                ? { text: 'Вы — экспедитор. Перевозчика найдёте на бирже', tone: 'info' }
                : { text: 'Укажите заказчика', tone: 'warn' };
        }
        if (isMeCustomer && isMeCarrier) return { text: 'Вы и заказчик, и перевозчик — перевозка своими силами', tone: 'info' };
        if (isMeCustomer && isMarketplace) return { text: 'Вы — заказчик. Заявка будет опубликована на бирже', tone: 'info' };
        if (isMeCustomer && selectedCarrier) return { text: 'Вы — заказчик. Перевозку выполняет контрагент', tone: 'ok' };
        if (isMeCustomer && !selectedCarrier) return { text: 'Вы — заказчик. Выберите перевозчика', tone: 'warn' };
        if (isMeCarrier && selectedCustomer) return { text: 'Вы — перевозчик. Заказ от контрагента', tone: 'ok' };
        if (!isMeCustomer && !isMeCarrier && selectedCustomer && selectedCarrier) return { text: 'Вы — посредник между заказчиком и перевозчиком', tone: 'info' };
        if (selectedCustomer && !selectedCarrier) return { text: 'Выберите перевозчика', tone: 'warn' };
        return { text: 'Укажите стороны сделки', tone: 'muted' };
    };


    const handleSubmit = async () => {
        // Validate parties
        if (!selectedCustomer) { toast.error('Укажите заказчика'); return; }
        if (!selectedCarrier) { toast.error('Укажите перевозчика'); return; }

        setSubmitting(true);
        try {
            const values = await form.validateFields();
            const pickupDateStr = values.pickupDate 
                ? (dayjs.isDayjs(values.pickupDate) ? values.pickupDate.toISOString() : new Date(values.pickupDate).toISOString()) 
                : undefined;

            // На бирже водителя нет: исполнителя выберут из откликов.
            let finalDriverId: string | undefined = searchingOnExchange ? undefined : (selectedDriverId || undefined);

            if (isOwnOrExternalCarrier && !searchingOnExchange) {
                const targetCompanyId = selectedCarrier === MY_COMPANY_VALUE 
                    ? selectedMyCompanyId 
                    : selectedCarrier;

                if (selectedDriverId === NEW_DRIVER) {
                    const driverData = {
                        firstName: values.firstName,
                        lastName: values.lastName,
                        middleName: values.middleName,
                        phone: values.phone,
                        iin: values.iin,
                        vehicleType: values.vehicleType,
                        vehicleModel: values.vehicleModel,
                        vehiclePlate: values.vehiclePlate,
                        trailerNumber: values.trailerNumber,
                        docType: values.docType,
                        docNumber: values.docNumber,
                        docIssuedAt: values.docIssuedAt ? values.docIssuedAt.toISOString() : undefined,
                        docExpiresAt: values.docExpiresAt ? values.docExpiresAt.toISOString() : undefined,
                        docIssuedBy: values.docIssuedBy,
                    };

                    const res = await api.post('/company/drivers', {
                        ...driverData,
                        companyId: targetCompanyId,
                    });
                    finalDriverId = res.data.id;
                    if (res.data.alreadyExists) {
                        toast.info(alreadyExistsMessage(res.data));
                    }
                } else if (selectedDriverId) {
                    // Правку данных водителя сохраняем в его карточку — у
                    // любого водителя базы, а не только у штатного: раньше у
                    // водителя перевозчика исправленный номер молча терялся.
                    // И только если поля правили: иначе правка старой заявки
                    // переписывала бы карточку тем, что было в ней тогда.
                    if (drivers.some((d) => d.id === selectedDriverId) && form.isFieldsTouched([...DRIVER_CARD_FIELDS])) {
                        const driverData = {
                            firstName: values.firstName,
                            lastName: values.lastName,
                            middleName: values.middleName,
                            phone: values.phone,
                            iin: values.iin,
                            vehicleType: values.vehicleType,
                            vehicleModel: values.vehicleModel,
                            vehiclePlate: values.vehiclePlate,
                            trailerNumber: values.trailerNumber,
                            docType: values.docType,
                            docNumber: values.docNumber,
                            docIssuedAt: values.docIssuedAt ? values.docIssuedAt.toISOString() : undefined,
                            docExpiresAt: values.docExpiresAt ? values.docExpiresAt.toISOString() : undefined,
                            docIssuedBy: values.docIssuedBy,
                        };
                        try {
                            await api.put(`/company/drivers/${selectedDriverId}`, driverData);
                        } catch (err: any) {
                            // Заявка сохранится и без этого, но молчать нельзя:
                            // человек поправил данные водителя и уйдёт уверенным,
                            // что они записаны.
                            toast.warning(err?.response?.data?.message
                                || 'Данные водителя в его карточке сохранить не удалось');
                        }
                    }
                } else {
                    finalDriverId = undefined;
                }
            }

            const getLocId = async (loc: LocationState) => {
                if (loc.id) return loc.id;
                const res = await api.post('/locations', {
                    name: `${loc.city}, ${loc.address}`,
                    address: `${loc.city}, ${loc.address}`,
                    // Пусто, а не ноль: (0, 0) — это точка в океане у берегов
                    // Африки. Такой адрес выглядел бы найденным, в дозапись
                    // координат не попадал, а на карте тянул бы маршрут через
                    // половину мира.
                    latitude: loc.latitude ?? null,
                    longitude: loc.longitude ?? null,
                    city: loc.city || ''
                });
                return res.data.id;
            };

            const routePoints = [];
            for (let i = 0; i < routePointsState.length; i++) {
                const p = routePointsState[i];
                if (!p.city && !p.address && !p.id) continue;
                const locId = await getLocId(p);
                routePoints.push({
                    locationId: locId,
                    pointType: p.pointType,
                    sequence: routePoints.length + 1,
                    expectedDate: p.pointType === 'PICKUP' ? pickupDateStr : (p.date || undefined)
                });
            }

            if (routePoints.length < 2) {
                toast.error('Укажите минимум 2 точки маршрута');
                setSubmitting(false);
                return;
            }

            // Build order payload based on selected parties
            // На бирже цена для исполнителя уходит не в заявку, а в выставление —
            // как кнопкой в карточке; ставка заказчика — только от внешнего.
            const finalCustomerPrice = searchingOnExchange
                ? (showCustomerPriceField ? values.customerPrice : undefined)
                : (showCustomerPriceField ? values.customerPrice : values.driverCost);
            const finalDriverCost = showDriverCostField ? values.driverCost : null;

            const orderData: any = {
                // Оба номера — без условий: графа больше не зависит от того,
                // заходил ли кто-то в карточку контрагента.
                ttnNumber: values.ttnNumber || undefined,
                customerRefNumber: values.customerRefNumber || undefined,
                cargoDescription: values.cargoDescription,
                natureOfCargo: values.natureOfCargo,
                cargoWeight: values.cargoWeight,
                cargoVolume: values.cargoVolume,
                cargoLength: showDims ? values.cargoLength : undefined,
                cargoWidth: showDims ? values.cargoWidth : undefined,
                cargoHeight: showDims ? values.cargoHeight : undefined,
                // Итог по местам считаем из состава — на него смотрят
                // карточка рейса, кабинет водителя и печатные формы.
                palletCount: cargo.pallets.length ? totalPallets(cargo.pallets) : values.palletCount,
                pallets: cargo.pallets,
                loadingTypes: cargo.loadingTypes,
                packagingTypes: cargo.packagingTypes,
                placesCount: cargo.placesCount,
                stackable: cargo.stackable,
                tempMin: cargo.tempMin,
                tempMax: cargo.tempMax,
                adr: cargo.adr,
                adrClass: cargo.adrClass,
                cargoValue: cargo.cargoValue,
                cargoType: values.cargoType,
                requirements: values.requirements,
                customerPrice: finalCustomerPrice,
                // Валюты обеих ставок. Раньше поля в форме были, а в запрос
                // не попадали: логист выбирал доллары, а заявка сохранялась
                // тенговой — и расхождение всплывало только в отчётах.
                currency: values.currency || 'KZT',
                driverCostCurrency: values.driverCostCurrency || 'KZT',
                customerPriceType: values.customerPriceType || 'FIXED',
                routePoints,
                customerId: user?.id,
                responsibleUserId: responsibleChoice === 'SELF' ? undefined : responsibleChoice,
                appliedTariffId: appliedTariff?.id || undefined,
                // НДС и сроки оплаты в заявку кладёт сервер — из карточек
                // сторон, где их заполнил бухгалтер. Отправлять их отсюда
                // значило бы спрашивать у того, кто ведёт рейс, ответ, за
                // который он не отвечает.
                driverId: isOwnOrExternalCarrier ? finalDriverId : undefined,
                // Машина этого рейса — в заявку: у каждого ИП своя, и
                // доверенность должна показать ту, на которой едут сейчас.
                ...(isOwnOrExternalCarrier && finalDriverId ? tripVehicle(values) : {}),
            };

            if (isMeCustomer) {
                // I am the customer
                orderData.customerCompanyId = selectedMyCompanyId;
                if (isMarketplace) {
                    // On marketplace — no forwarder assigned
                    orderData.driverCost = finalDriverCost || null;
                } else if (isMeCarrier) {
                    // Self-delivery
                    orderData.forwarderId = selectedMyCompanyId;
                } else {
                    // External carrier
                    orderData.forwarderId = selectedCarrier;
                    orderData.driverCost = finalDriverCost || null;
                }
            } else if (isMeCarrier) {
                // I am the carrier, customer is external
                orderData.customerCompanyId = selectedCustomer;
                orderData.forwarderId = selectedMyCompanyId;
            } else {
                // I am a middleman — customer and carrier are both external
                orderData.customerCompanyId = selectedCustomer;
                if (isMarketplace) {
                    orderData.subForwarderId = selectedMyCompanyId;
                    orderData.subForwarderPrice = finalDriverCost || null;
                    // Ставка перевозчика ушла в поле суб-экспедитора — валюта
                    // из того же поля формы идёт следом.
                    orderData.subForwarderPriceCurrency = values.driverCostCurrency || 'KZT';
                } else {
                    orderData.forwarderId = selectedMyCompanyId;
                    orderData.subForwarderId = selectedCarrier;
                    orderData.subForwarderPrice = finalDriverCost || null;
                    orderData.subForwarderPriceCurrency = values.driverCostCurrency || 'KZT';
                }
            }

            if (editingId) {
                // Правка идёт тем же набором полей, что и заведение: одна
                // форма — один состав заявки.
                await api.put(`/orders/${editingId}`, orderData);
                if (exchangeActive) {
                    await publishNewOrder({ id: editingId, orderNumber: editingNumber }, exchangeNoPrice ? null : Number(values.exchangePrice), (id) => router.push(`/company/orders/${id}`), 'сохранена');
                } else {
                    toast.success('Заявка сохранена');
                }
                onSaved(editingId);
            } else {
                const { data: created } = await api.post('/orders', orderData);
                // Заявка заведена — черновик своё отслужил. Иначе следующая
                // новая заявка открылась бы с данными этой.
                черновикЗакрыт.current = true;
                if (черновикКлюч) clearDraft(черновикКлюч);
                if (exchangeActive) {
                    await publishNewOrder(created, exchangeNoPrice ? null : Number(values.exchangePrice), (id) => router.push(`/company/orders/${id}`));
                }
                // Экран «Заявка создана» (ТЗ, §9): журнал обновляем сразу, окно закрывает «Готово».
                onRefresh?.();
                setСоздано(итогСоздания(created));
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message
                || (editingId ? 'Не удалось сохранить заявку' : 'Ошибка создания заявки'));
        } finally {
            setSubmitting(false);
        }
    };

    // =================== ОКНО «НОВАЯ ЗАЯВКА»: ВИД ===================

    const mainRef = useRef<HTMLElement>(null);
    /** Форма прокручена — под шапкой тень (ТЗ, §3). */
    const [прокручено, setПрокручено] = useState(false);
    /** Какой раздел сейчас на экране — подсвечен в сводке. */
    const [текущийРаздел, setТекущийРаздел] = useState<string | null>('parties');
    /** Ошибки показываем только после первой попытки создать (ТЗ, §8). */
    const [попыткаОтправки, setПопыткаОтправки] = useState(false);
    /** Ошибки полей формы меняются сами — перерисовываем сводку вместе с ними. */
    const [, setПоляТик] = useState(0);
    /** Паспорт, телефон и машина водителя — раскрыто у нового, по кнопке у выбранного. */
    const [анкетаОткрыта, setАнкетаОткрыта] = useState(false);
    /** Только что добавленная точка — сразу открыть её адрес. */
    const [открытьТочку, setОткрытьТочку] = useState<number | null>(null);
    /** Что набрали в поиске адреса — станет названием нового адреса. */
    const [новыйАдрес, setНовыйАдрес] = useState('');
    /** При открытии подставлен черновик — сначала спрашиваем, продолжить ли. */
    const [черновикПринят, setЧерновикПринят] = useState(false);
    /** Заявка создана — вместо формы экран с итогом. */
    const [создано, setСоздано] = useState<{ published: boolean; rows: { k: string; v: string }[] } | null>(null);

    const watchedCustomerPrice = Form.useWatch('customerPrice', form);
    const watchedDriverCost = Form.useWatch('driverCost', form);
    const watchedExchangePrice = Form.useWatch('exchangePrice', form);
    const watchedCurrency = Form.useWatch('currency', form);
    const watchedDriverCurrency = Form.useWatch('driverCostCurrency', form);
    const watchedPickupDate = Form.useWatch('pickupDate', form);
    const watchedNature = Form.useWatch('natureOfCargo', form);
    const watchedWeight = Form.useWatch('cargoWeight', form);
    const watchedVolume = Form.useWatch('cargoVolume', form);
    const watchedBody = Form.useWatch('cargoType', form) as string | undefined;
    const watchedPlate = Form.useWatch('vehiclePlate', form);
    const watchedTrailer = Form.useWatch('trailerNumber', form);
    const watchedNewDriver = [Form.useWatch('lastName', form), Form.useWatch('firstName', form), Form.useWatch('phone', form)];

    type ОшибкаФормы = { key: string; section: string; message: string; target: string };
    /**
     * Чего не хватает — те же проверки, что были по шагам мастера, разом
     * (заказчик, перевозчик, погрузка и выгрузка, дата, характер груза).
     * Порядок — как на экране: к первой ошибке и прокручиваем.
     */
    const ошибкиФормы: ОшибкаФормы[] = (() => {
        const list: ОшибкаФормы[] = [];
        if (!selectedCustomer) list.push({ key: 'customer', section: 'parties', message: 'Выберите заказчика', target: 'no-customer' });
        if (!selectedCarrier && !searchingOnExchange) {
            list.push({
                key: 'carrier',
                section: 'parties',
                message: exchangeAvailable ? 'Выберите перевозчика — или переключите на «На бирже»' : 'Выберите перевозчика',
                target: 'no-carrier',
            });
        }
        const есть = (type: string) => routePointsState.some((p) => p.pointType === type && (p.id || p.city));
        if (!есть('PICKUP')) {
            const idx = Math.max(0, routePointsState.findIndex((p) => p.pointType === 'PICKUP'));
            list.push({ key: `point-${idx}`, section: 'route', message: 'Укажите, откуда забирать груз', target: `no-point-${idx}` });
        }
        if (!watchedPickupDate) list.push({ key: 'pickupDate', section: 'route', message: 'Укажите, когда забирать груз', target: 'no-pickup-date' });
        if (!есть('DELIVERY')) {
            let idx = routePointsState.length - 1;
            for (let j = routePointsState.length - 1; j >= 0; j--) {
                if (routePointsState[j].pointType === 'DELIVERY') { idx = j; break; }
            }
            list.push({ key: `point-${idx}`, section: 'route', message: 'Укажите, куда везти груз', target: `no-point-${idx}` });
        }
        if (!editingId && !String(watchedNature || '').trim()) {
            list.push({ key: 'nature', section: 'cargo', message: 'Укажите, что везём', target: 'no-nature' });
        }
        return list;
    })();
    /** Ошибки полей, которые проверяет сама форма: цена биржи, новый водитель. */
    const ошибкиПолей = попыткаОтправки
        ? form.getFieldsError().filter((f) => f.errors.length > 0 && !['pickupDate', 'natureOfCargo'].includes(String(f.name[0]))).length
        : 0;

    const плавно = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') as ScrollBehavior;

    /** Прокрутить форму к элементу так, чтобы над ним было место (ТЗ, §8: ~80 px). */
    const прокрутитьК = (el: HTMLElement, отступ: number) => {
        const main = mainRef.current;
        if (!main) return;
        const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - отступ;
        main.scrollTo({ top: Math.max(0, top), behavior: плавно() });
    };

    const перейтиК = (key: string) => {
        const el = document.getElementById(`no-sec-${key}`);
        if (el) прокрутитьК(el, 16);
        setТекущийРаздел(key);
    };

    /** Какой раздел на экране: последний, чей верх уже выше трети окна. */
    const обновитьРаздел = () => {
        const main = mainRef.current;
        if (!main) return;
        const граница = main.getBoundingClientRect().top + main.clientHeight / 3;
        let текущий: string | null = 'parties';
        main.querySelectorAll<HTMLElement>('[data-section]').forEach((sec) => {
            if (sec.getBoundingClientRect().top <= граница) текущий = sec.dataset.section ?? текущий;
        });
        if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) текущий = 'driver';
        setТекущийРаздел(текущий);
    };

    const отправить = async () => {
        if (submitting) return;
        setПопыткаОтправки(true);
        const поляФормы = [
            'pickupDate',
            ...(editingId ? [] : ['natureOfCargo']),
            ...(exchangeActive && !exchangeNoPrice ? ['exchangePrice'] : []),
            ...(isOwnOrExternalCarrier && selectedDriverId === NEW_DRIVER ? ['lastName', 'firstName', 'phone', 'vehiclePlate'] : []),
        ];
        let плохиеПоля: string[] = [];
        try {
            await form.validateFields(поляФормы);
        } catch (e: any) {
            плохиеПоля = (e?.errorFields || []).map((f: any) => String(f.name?.[0]));
        }
        setПоляТик((n) => n + 1);
        if (ошибкиФормы.length || плохиеПоля.length) {
            const ids = [
                ...ошибкиФормы.map((e) => e.target),
                ...плохиеПоля.map((n) => ({ exchangePrice: 'no-exchange-price', natureOfCargo: 'no-nature', pickupDate: 'no-pickup-date' } as Record<string, string>)[n] ?? n),
            ];
            const первый = ids
                .map((id) => document.getElementById(id))
                .filter((el): el is HTMLElement => !!el)
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
            if (первый) {
                прокрутитьК(первый, 80);
                первый.focus({ preventScroll: true });
            }
            return;
        }
        await handleSubmit();
    };

    const выбратьОрганизацию = (value: string) => {
        setSelectedMyCompanyId(value || '');
        setSelectedDriverId('');
        form.setFieldsValue({
            firstName: '', lastName: '', middleName: '', phone: '', iin: '',
            vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
            docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: '',
            vehicleSelect: undefined, driverSelect: undefined,
        });
    };

    /**
     * Передумал с водителем — назначит позже. Данные водителя из формы
     * убираем; госномера — только если их подставила его карточка: вписанные
     * руками или взятые из автопарка остаются.
     */
    const убратьВодителя = () => {
        const d = drivers.find((x) => x.id === selectedDriverId);
        const сброс: Record<string, unknown> = {
            driverId: undefined,
            lastName: '', firstName: '', middleName: '', phone: '', iin: '',
            vehicleType: undefined, vehicleModel: '',
            docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: '',
        };
        if (d && (form.getFieldValue('vehiclePlate') || '') === (d.vehiclePlate || '')) сброс.vehiclePlate = '';
        if (d && (form.getFieldValue('trailerNumber') || '') === (d.trailerNumber || '')) сброс.trailerNumber = '';
        setSelectedDriverId('');
        setАнкетаОткрыта(false);
        form.setFieldsValue(сброс);
    };

    const выбратьПеревозчика = (val: string) => {
        setSelectedCarrier(val);
        setSelectedDriverId('');
        setАнкетаОткрыта(false);
        form.setFieldsValue({
            driverId: undefined,
            lastName: '', firstName: '', middleName: '', phone: '', iin: '',
            vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
            docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: '',
        });
    };

    const выбратьАдрес = (i: number, val: string) => {
        const newPts = [...routePointsState];
        const loc = locations.find((l) => l.id === val);
        if (!loc) return;
        newPts[i] = {
            ...newPts[i],
            city: loc.city || '',
            address: loc.address,
            id: loc.id,
            latitude: loc.latitude,
            longitude: loc.longitude,
            // Подставляем почту, уже закреплённую за адресом.
            emails: parseEmails((loc as any).emails),
        };
        const firstPickup = newPts.find((p) => p.pointType === 'PICKUP');
        const lastDelivery = [...newPts].reverse().find((p) => p.pointType === 'DELIVERY');
        if (firstPickup?.city && lastDelivery?.city) lookupTariff(firstPickup.city, lastDelivery.city);
        setRoutePointsState(newPts);
    };

    /** «+ Добавить точку»: догрузка перед последней выгрузкой (ТЗ, §5.3), и сразу поиск адреса. */
    const добавитьТочку = () => {
        const next = [...routePointsState];
        const at = next.length && next[next.length - 1].pointType === 'DELIVERY' ? next.length - 1 : next.length;
        next.splice(at, 0, { city: '', address: '', pointType: 'ADDITIONAL_PICKUP' });
        setRoutePointsState(next);
        setОткрытьТочку(at);
    };

    /** Итог для экрана «Заявка создана» (ТЗ, §9). */
    const итогСоздания = (created: { orderNumber?: string }) => {
        const rows: { k: string; v: string }[] = [];
        if (created?.orderNumber) rows.push({ k: 'Номер', v: created.orderNumber });
        if (myCompanies.length > 1) rows.push({ k: 'Организация', v: myCompanyLabel });
        const города = routePointsState.filter((p) => p.id || p.city).map((p) => {
            const loc = p.id ? locations.find((l) => l.id === p.id) : undefined;
            return loc?.city || p.city || loc?.name || '';
        }).filter(Boolean);
        const дата = form.getFieldValue('pickupDate');
        rows.push({ k: 'Маршрут', v: [города.join(' → '), дата ? `погрузка ${dayjs(дата).format('DD.MM, HH:mm')}` : null].filter(Boolean).join(', ') });
        const имя = (v: string) => (v === MY_COMPANY_VALUE ? myCompanyLabel : partners.find((p) => p.id === v)?.name || '');
        rows.push({ k: 'Заказчик', v: имя(selectedCustomer) });
        rows.push({ k: 'Перевозчик', v: exchangeActive ? 'Ищем на бирже' : имя(selectedCarrier) });
        const cp = Number(form.getFieldValue('customerPrice')) || 0;
        const dc = Number(exchangeActive ? form.getFieldValue('exchangePrice') : form.getFieldValue('driverCost')) || 0;
        if (cp || dc) rows.push({ k: 'Ставки', v: [cp ? moneyShort(cp) : null, dc ? moneyShort(dc) : null].filter(Boolean).join(' → ') });
        const груз = [String(form.getFieldValue('natureOfCargo') || '').trim(), form.getFieldValue('cargoWeight') ? `${form.getFieldValue('cargoWeight')} кг` : null].filter(Boolean).join(' · ');
        if (груз) rows.push({ k: 'Груз', v: груз });
        const d = selectedDriverId && selectedDriverId !== NEW_DRIVER ? drivers.find((x) => x.id === selectedDriverId) : undefined;
        const фио = d ? [d.lastName, d.firstName].filter(Boolean).join(' ')
            : selectedDriverId === NEW_DRIVER ? [form.getFieldValue('lastName'), form.getFieldValue('firstName')].filter(Boolean).join(' ') : '';
        if (фио && !exchangeActive) rows.push({ k: 'Водитель', v: фио });
        return { published: exchangeActive, rows };
    };

    const roleInfo = getRoleDescription();

    // Название организации, от лица которой создаётся заявка (обновляется при смене организации)
    const myCompanyLabel = myCompanies.find(c => c.id === selectedMyCompanyId)?.name?.trim() || myCompanyName || 'Моя компания';

    const currentCustomerCompany = selectedCustomer === MY_COMPANY_VALUE
        ? { id: selectedMyCompanyId, name: myCompanies.find(c => c.id === selectedMyCompanyId)?.name || myCompanyName || 'Моя компания' }
        : selectedCustomer
            ? { id: selectedCustomer, name: partners.find(p => p.id === selectedCustomer)?.name || 'Заказчик' }
            : undefined;

    const currentCarrierCompany = selectedCarrier === MY_COMPANY_VALUE
        ? { id: selectedMyCompanyId, name: myCompanies.find(c => c.id === selectedMyCompanyId)?.name || myCompanyName || 'Моя компания' }
        : (selectedCarrier && selectedCarrier !== MARKETPLACE_VALUE)
            ? { id: selectedCarrier, name: partners.find(p => p.id === selectedCarrier)?.name || 'Исполнитель' }
            : undefined;

    // =================== ОКНО «НОВАЯ ЗАЯВКА» (вариант B, 29.10.2026) ===================

    const ошибка = (key: string) => (попыткаОтправки ? ошибкиФормы.find((e) => e.key === key)?.message ?? null : null);
    const имяСтороны = (value: string) => (value === MY_COMPANY_VALUE ? myCompanyLabel : partners.find((p) => p.id === value)?.name || '');
    const короткоеИмя = (name: string) => name.replace(/^(ТОО|АО|ИП|ООО)\s+/i, '').replace(/[«»"]/g, '');
    const точкаАдрес = (pt: LocationState) => {
        const loc = pt.id ? locations.find((l) => l.id === pt.id) : undefined;
        return {
            title: loc?.name || pt.city || pt.address || '',
            sub: loc ? адресСтрокой(loc.city, loc.address) : (pt.city ? pt.address : ''),
            city: loc?.city || pt.city || '',
        };
    };
    const числоТ = (kg?: number | null) => (kg ? `${(Math.round(kg / 100) / 10).toLocaleString('ru-RU')} т` : null);

    // Сводка (ТЗ, §6): чего не хватает — первой строкой.
    const сторонаГотова = !!selectedCustomer && (!!selectedCarrier || searchingOnExchange);
    const ставкаЗаказчика = Number(watchedCustomerPrice) || 0;
    const ставкаПеревозчику = Number(searchingOnExchange ? watchedExchangePrice : watchedDriverCost) || 0;
    const главнаяСтавка = showCustomerPriceField ? ставкаЗаказчика : ставкаПеревозчику;
    // Маржа в сводке — та же, что в расчёте по рейсу под ставками: без НДС
    // сторон. Две разные цифры маржи на одном экране сбивают с толку. При
    // разных валютах её считают по курсу только там — в сводке не пишем.
    const безНдс = (сумма: number, terms: typeof customerTerms) => (terms?.vatPayer ? сумма / (1 + Number(terms.vatRate ?? 0) / 100) : сумма);
    const заказчикуБезНдс = безНдс(ставкаЗаказчика, customerTerms);
    const маржа = showCustomerPriceField && showDriverCostField && !exchangeActive && ставкаЗаказчика > 0 && ставкаПеревозчику > 0
        && (watchedCurrency || 'KZT') === (watchedDriverCurrency || 'KZT')
        ? Math.round((заказчикуБезНдс - безНдс(ставкаПеревозчику, carrierTerms)) * 100) / 100 : null;
    const маржаТекст = маржа != null
        ? `${маржа < 0 ? '−' : ''}${moneyShort(Math.abs(маржа))} · ${маржа < 0 ? '−' : ''}${Math.abs(Math.round(маржа / заказчикуБезНдс * 100))} %`
        : null;
    const первая = routePointsState.find((p) => p.pointType === 'PICKUP');
    const последняя = [...routePointsState].reverse().find((p) => p.pointType === 'DELIVERY');
    const маршрутГотов = !!(первая && (первая.id || первая.city)) && !!(последняя && (последняя.id || последняя.city)) && !!watchedPickupDate;
    const характер = String(watchedNature || '').trim();
    const грузГотов = !!характер || !!editingId;
    const водитель = selectedDriverId && selectedDriverId !== NEW_DRIVER ? drivers.find((d) => d.id === selectedDriverId) : undefined;
    const статус = (готов: boolean, начат: boolean, key: string): SummaryStatus => {
        if (готов) return 'done';
        if (попыткаОтправки && ошибкиФормы.some((e) => e.section === key)) return 'error';
        return начат || попыткаОтправки ? 'warn' : 'empty';
    };
    // Новый водитель: без ФИО, телефона и госномера заявку не создать — сводка говорит об этом заранее.
    const новыйВодительЗаполнен = watchedNewDriver.every((v) => String(v ?? '').trim()) && !!String(watchedPlate ?? '').trim();
    const тон = (k: string) => (попыткаОтправки && ошибкиФормы.some((e) => e.section === k) ? 'error' as const : 'warn' as const);
    const summaryItems: SummaryItem[] = [
        {
            key: 'parties',
            title: 'Стороны',
            status: статус(сторонаГотова, !!selectedCustomer || !!selectedCarrier, 'parties'),
            lines: сторонаГотова
                ? [{ text: `${короткоеИмя(имяСтороны(selectedCustomer))} → ${searchingOnExchange ? 'на бирже' : короткоеИмя(имяСтороны(selectedCarrier))}` }]
                : [{ text: !selectedCustomer ? 'Не выбран заказчик' : 'Не выбран перевозчик', tone: тон('parties') }],
        },
        {
            key: 'rates',
            title: 'Ставки',
            status: главнаяСтавка > 0 ? 'done' : (попыткаОтправки || ставкаПеревозчику > 0 ? 'warn' : 'empty'),
            lines: главнаяСтавка > 0
                ? [
                    { text: showCustomerPriceField && ставкаПеревозчику > 0
                        ? `${moneyShort(ставкаЗаказчика)} → ${searchingOnExchange ? 'до ' : ''}${moneyShort(ставкаПеревозчику)}`
                        : moneyShort(главнаяСтавка) },
                    ...(маржаТекст ? [{ text: `Маржа ${маржаТекст}` }] : []),
                ]
                : [{ text: showCustomerPriceField ? 'Нет ставки заказчика' : 'Нет ставки перевозчику', tone: 'warn' as const }],
        },
        {
            key: 'route',
            title: 'Маршрут',
            status: статус(маршрутГотов, routePointsState.some((p) => p.id || p.city) || !!watchedPickupDate, 'route'),
            lines: маршрутГотов
                ? [
                    { text: routePointsState.filter((p) => p.id || p.city).map((p) => точкаАдрес(p).city || точкаАдрес(p).title).filter(Boolean).join(' → ') },
                    { text: `Погрузка ${dayjs(watchedPickupDate).format('DD.MM, HH:mm')}` },
                ]
                : [{
                    text: !(первая && (первая.id || первая.city)) ? 'Нет адреса погрузки'
                        : !(последняя && (последняя.id || последняя.city)) ? 'Нет адреса выгрузки' : 'Нет даты погрузки',
                    tone: тон('route'),
                }],
        },
        {
            key: 'cargo',
            title: 'Груз и транспорт',
            status: статус(грузГотов, !!watchedWeight || !!watchedBody || cargo.packagingTypes.length > 0, 'cargo'),
            lines: грузГотов
                ? [
                    { text: [характер || 'Груз', числоТ(watchedWeight), watchedVolume ? `${watchedVolume} м³` : null].filter(Boolean).join(' · ') },
                    {
                        text: [
                            watchedBody ? watchedBody.charAt(0).toUpperCase() + watchedBody.slice(1) : 'Любой кузов',
                            (watchedBody === 'рефрижератор' || watchedBody === 'изотерм') && cargo.tempMin != null && cargo.tempMax != null
                                ? `${fmtT(cargo.tempMin)}…${fmtT(cargo.tempMax)} °C` : null,
                            totalPallets(cargo.pallets) ? `${totalPallets(cargo.pallets)} палл.` : null,
                        ].filter(Boolean).join(' · '),
                    },
                ]
                : [{ text: 'Не указан характер груза', tone: тон('cargo') }],
        },
        {
            key: 'driver',
            title: 'Водитель',
            // Выбрали «Новый водитель» — его данные обязательны, и счётчик готовности их ждёт.
            optional: selectedDriverId !== NEW_DRIVER,
            status: searchingOnExchange || водитель ? 'done'
                : selectedDriverId === NEW_DRIVER ? (новыйВодительЗаполнен ? 'done' : 'warn')
                    : 'empty',
            lines: searchingOnExchange
                ? [{ text: 'Укажет перевозчик с биржи', tone: 'muted' }]
                : водитель
                    ? [
                        { text: [водитель.lastName, водитель.firstName, водитель.middleName].filter(Boolean).join(' ') },
                        ...((watchedPlate || watchedTrailer) ? [{ text: [watchedPlate, watchedTrailer].filter(Boolean).join(' + ') }] : []),
                    ]
                    : selectedDriverId === NEW_DRIVER
                        ? [новыйВодительЗаполнен
                            ? { text: [watchedNewDriver[0], watchedNewDriver[1]].filter(Boolean).join(' ') }
                            : { text: 'Заполните данные водителя', tone: 'warn' }]
                        : [{ text: isCarrierOnPlatform ? 'Назначит перевозчик' : 'Необязательно', tone: 'muted' }],
        },
    ];
    const числоОшибок = ошибкиФормы.length + ошибкиПолей;
    const ctaText = editingId ? 'Сохранить заявку' : exchangeActive ? 'Создать и опубликовать' : 'Создать заявку';

    // Водитель числится у другого перевозчика — предупреждаем, не мешаем (ТЗ, §5.6).
    const перевозчикId = selectedCarrier === MY_COMPANY_VALUE ? (user?.companyId ?? null) : selectedCarrier || null;
    const водительЧужой = !!водитель && !!перевозчикId && водитель.carrierIds.length > 0 && !водитель.carrierIds.includes(перевозчикId)
        ? `Водитель числится у «${короткоеИмя(водитель.lastTrip?.carrierName || водитель.companyName || 'другого перевозчика')}», а перевозчик в заявке — «${короткоеИмя(имяСтороны(selectedCarrier))}»`
        : null;

    const кузов = (
        <BodySection
            bodyType={watchedBody || undefined}
            onBodyType={(v) => { form.setFieldValue('cargoType', v); setПравкаФормы((n) => n + 1); }}
            cargo={cargo}
            onCargo={setCargo}
        />
    );

    const данныеВодителя = selectedDriverId && (selectedDriverId === NEW_DRIVER || анкетаОткрыта) && (
        <div className={s.driverCard}>
            <div className={s.driverCardHead}>
                <span className={s.label}>{selectedDriverId === NEW_DRIVER ? 'Новый водитель' : 'Данные водителя'}</span>
                {selectedDriverId !== NEW_DRIVER && (
                    <button type="button" className={s.linkBtn} onClick={() => setАнкетаОткрыта(false)}>Свернуть</button>
                )}
            </div>
            <div className={s.subTitle}>ФИО</div>
            <div className={s.grid3}>
                <Form.Item name="lastName" rules={[{ required: selectedDriverId === NEW_DRIVER, message: 'Введите фамилию' }]}>
                    <UiInput className={FIELD} placeholder="Фамилия" aria-label="Фамилия" />
                </Form.Item>
                <Form.Item name="firstName" rules={[{ required: selectedDriverId === NEW_DRIVER, message: 'Введите имя' }]}>
                    <UiInput className={FIELD} placeholder="Имя" aria-label="Имя" />
                </Form.Item>
                <Form.Item name="middleName">
                    <UiInput className={FIELD} placeholder="Отчество" aria-label="Отчество" />
                </Form.Item>
            </div>
            {/* Порядок, как просил шеф (E1): ФИО → удостоверение → телефон → машина. */}
            <div className={s.subTitle}>Документ</div>
            <div className={s.grid3}>
                <Form.Item name="docType">
                    <FormSelect
                        aria-label="Тип документа"
                        className={s.shadSelect}
                        placeholder="Тип документа"
                        options={[
                            { value: 'ID_CARD', label: 'Удостоверение личности' },
                            { value: 'PASSPORT', label: 'Паспорт' },
                        ]}
                    />
                </Form.Item>
                <Form.Item name="docNumber">
                    <UiInput className={FIELD} placeholder="Номер документа" aria-label="Номер документа" />
                </Form.Item>
                <Form.Item name="docIssuedBy">
                    <UiInput className={FIELD} placeholder="Кем выдан, например МВД РК" aria-label="Кем выдан" />
                </Form.Item>
                <Form.Item name="docIssuedAt">
                    <DateField style={{ width: '100%' }} placeholder="Дата выдачи" aria-label="Дата выдачи" />
                </Form.Item>
                <Form.Item name="docExpiresAt">
                    <DateField style={{ width: '100%' }} placeholder="Срок действия" aria-label="Срок действия" />
                </Form.Item>
            </div>
            <div className={s.subTitle}>Связь и машина</div>
            <div className={s.grid3}>
                <Form.Item name="phone" rules={[{ required: selectedDriverId === NEW_DRIVER, message: 'Введите телефон' }]}>
                    <UiInput className={FIELD} placeholder="Телефон +77001234567" aria-label="Телефон" />
                </Form.Item>
                <Form.Item name="iin">
                    <UiInput className={FIELD} placeholder="ИИН" aria-label="ИИН" maxLength={12} />
                </Form.Item>
                <Form.Item name="vehicleModel">
                    <UiInput className={FIELD} placeholder="Модель машины, например Volvo FH12" aria-label="Модель автомобиля" />
                </Form.Item>
                <Form.Item name="vehicleType">
                    <ChoiceField
                        aria-label="Тип транспорта"
                        title="Тип кузова"
                        placeholder="Тип кузова машины"
                        searchPlaceholder="Например: тент, реф, борт"
                        recentKey="body-type"
                        onChange={() => undefined}
                        groups={BODY_TYPE_GROUPS}
                    />
                </Form.Item>
            </div>
        </div>
    );

    const форма = (
        <Form form={form} layout="vertical" onValuesChange={() => setПравкаФормы((n) => n + 1)} component={false}>
            {/* Поля без своего вида: значение держит форма, выбирают плитками и шапкой. */}
            <Form.Item name="cargoType" hidden><input /></Form.Item>
            <Form.Item name="palletCount" hidden><input /></Form.Item>

            {!profileComplete && (
                <div className={s.note}>
                    <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
                    <span>
                        Для доверенностей и счетов заполните{' '}
                        <button type="button" className={s.linkInline} onClick={() => router.push('/company/settings')}>профиль компании</button>
                    </span>
                </div>
            )}

            {/* ===== Стороны ===== */}
            <section id="no-sec-parties" data-section="parties" className={s.section} aria-labelledby="no-h-parties">
                <SectionHead
                    id="no-h-parties"
                    title="Стороны"
                    aside={roleInfo.tone !== 'muted' && (
                        <span className={cn(s.pill, roleInfo.tone === 'ok' && s.pillOk, roleInfo.tone === 'warn' && s.pillWarn, roleInfo.tone === 'info' && s.pillInfo)}>
                            <CircleCheck className="size-3.5 shrink-0" aria-hidden />{roleInfo.text}
                        </span>
                    )}
                />
                <div className={s.grid2}>
                    <Field id="no-customer" label="Заказчик" error={ошибка('customer')}>
                        <PartnerPicker
                            role="CUSTOMER"
                            value={selectedCustomer || undefined}
                            onChange={setSelectedCustomer}
                            partners={partners}
                            ownValue={MY_COMPANY_VALUE}
                            ownLabel={myCompanyLabel}
                            userId={user?.id}
                            scope={user?.companyId}
                            onAdd={() => открытьЗаведениеКонтрагента('CUSTOMER')}
                            renderField={(api) => (
                                <InlineCombo
                                    id="no-customer"
                                    dataGuide="wizard-customer"
                                    value={selectedCustomer || undefined}
                                    valueTitle={api.label}
                                    placeholder="Выберите заказчика"
                                    searchPlaceholder="Название, БИН или город"
                                    items={[{ ...api.own, pinned: true }, ...api.items]}
                                    recentKey={api.recentKey}
                                    loading={партнёрыГрузятся}
                                    directoryLabel={(q) => (q ? `Не нашли «${q}» — открыть справочник` : (api.count ? `Открыть справочник · ${api.count} ${склон(api.count, 'заказчик', 'заказчика', 'заказчиков')}` : 'Справочник пуст — добавить заказчика'))}
                                    onOpenDirectory={api.open}
                                    onSelect={setSelectedCustomer}
                                    invalid={!!ошибка('customer')}
                                    describedBy={ошибка('customer') ? 'no-customer-err' : undefined}
                                />
                            )}
                        />
                    </Field>
                    <Field
                        id="no-carrier"
                        label="Перевозчик"
                        error={ошибка('carrier')}
                        aside={exchangeAvailable && (
                            <Segmented
                                ariaLabel="Кто повезёт"
                                value={exchangeActive ? 'exchange' : 'own'}
                                options={[{ value: 'own', label: 'Свой' }, { value: 'exchange', label: 'На бирже' }]}
                                onChange={(v) => toggleExchange(v === 'exchange')}
                            />
                        )}
                    >
                        {searchingOnExchange ? (
                            <div className={cn(s.dashed, s.dashedSm)} data-guide="wizard-carrier">
                                <Globe className="size-4 shrink-0" aria-hidden />
                                <span>{alreadyOnExchange ? 'Ищем на бирже — выберете из откликов' : 'Опубликуем на бирже сразу после создания'}</span>
                            </div>
                        ) : (
                            <PartnerPicker
                                role="CARRIER"
                                value={selectedCarrier || undefined}
                                onChange={выбратьПеревозчика}
                                partners={partners}
                                ownValue={MY_COMPANY_VALUE}
                                ownLabel={myCompanyLabel}
                                userId={user?.id}
                                scope={user?.companyId}
                                onAdd={() => открытьЗаведениеКонтрагента('CARRIER')}
                                renderField={(api) => (
                                    <InlineCombo
                                        id="no-carrier"
                                        dataGuide="wizard-carrier"
                                        value={selectedCarrier || undefined}
                                        valueTitle={api.label}
                                        placeholder="Выберите перевозчика"
                                        searchPlaceholder="Название, БИН или город"
                                        items={[{ ...api.own, pinned: true }, ...api.items]}
                                        recentKey={api.recentKey}
                                        loading={партнёрыГрузятся}
                                        directoryLabel={(q) => (q ? `Не нашли «${q}» — открыть справочник` : (api.count ? `Открыть справочник · ${api.count} ${склон(api.count, 'перевозчик', 'перевозчика', 'перевозчиков')}` : 'Справочник пуст — добавить перевозчика'))}
                                        onOpenDirectory={api.open}
                                        onSelect={выбратьПеревозчика}
                                        invalid={!!ошибка('carrier')}
                                        describedBy={ошибка('carrier') ? 'no-carrier-err' : undefined}
                                    />
                                )}
                            />
                        )}
                        {alreadyOnExchange && editingId && <ExchangeOnBoardNote orderId={editingId} price={editExchange?.price ?? null} />}
                    </Field>
                </div>

                <div className="mt-3">
                    <Form.Item noStyle dependencies={['ttnNumber', 'customerRefNumber']}>
                        {({ getFieldValue }) => (
                            <TransportNumbers
                                ttnNumber={getFieldValue('ttnNumber')}
                                refNumber={getFieldValue('customerRefNumber')}
                                refLabel={customerRefLabel}
                                counterpartyId={selectedCustomer && selectedCustomer !== MY_COMPANY_VALUE ? selectedCustomer : null}
                                canRename={!!selectedCustomerIsExternal}
                                onRenamed={(label) => setFetchedPartners((prev) => prev.map((p: any) => (
                                    p.id === selectedCustomer ? { ...p, customerRefLabel: label } : p
                                )))}
                            />
                        )}
                    </Form.Item>
                </div>
            </section>

            {/* ===== Ставки ===== */}
            <section id="no-sec-rates" data-section="rates" className={s.section} aria-labelledby="no-h-rates">
                <SectionHead id="no-h-rates" title="Ставки" />
                <div className={s.gridRates} style={{ '--rates-cols': `${[showCustomerPriceField, exchangeActive || showDriverCostField].filter(Boolean).map(() => 'minmax(0, 1fr)').join(' ')} 180px` } as React.CSSProperties}>
                    {showCustomerPriceField && (
                        <Field id="no-customer-price" label={customerPriceLabel}>
                            <Form.Item name="customerPrice">
                                <MoneyInput
                                    id="no-customer-price"
                                    placeholder="Сумма"
                                    addonAfter={(
                                        <Form.Item name="currency" noStyle initialValue="KZT">
                                            <CurrencySelect />
                                        </Form.Item>
                                    )}
                                />
                            </Form.Item>
                            {appliedTariff && (
                                <span className={cn(s.pill, s.pillOk)} style={{ alignSelf: 'flex-start' }}>
                                    <CircleCheck className="size-3.5" aria-hidden /> Тариф ДС №{appliedTariff.agreement?.agreementNumber || '—'}
                                </span>
                            )}
                        </Field>
                    )}
                    {exchangeActive && (
                        <Field id="no-exchange-price" label="Бюджет перевозчику" hint={(
                            <label className="flex cursor-pointer items-center gap-2 text-[12.5px]" style={{ color: 'var(--nova-fg-2)' }}>
                                <Checkbox checked={exchangeNoPrice} onCheckedChange={(c) => setExchangeNoPrice(c === true)} />
                                Без цены — пусть исполнители предложат свою
                            </label>
                        )}>
                            {!exchangeNoPrice ? (
                                <Form.Item
                                    name="exchangePrice"
                                    rules={[{
                                        validator: (_, v) => (Number(v) > 0
                                            ? Promise.resolve()
                                            : Promise.reject(new Error('Укажите цену — исполнители согласятся на неё или предложат свою'))),
                                    }]}
                                >
                                    <MoneyInput id="no-exchange-price" addonAfter="KZT" placeholder="Сумма" aria-label="Цена для исполнителя на бирже" />
                                </Form.Item>
                            ) : (
                                <div className={cn(s.dashed, s.dashedSm)}>Исполнители предложат свою цену</div>
                            )}
                        </Field>
                    )}
                    {showDriverCostField && !exchangeActive && (
                        <Field id="no-driver-cost" label={driverCostLabel}>
                            <Form.Item name="driverCost">
                                <MoneyInput
                                    id="no-driver-cost"
                                    placeholder="Сумма"
                                    addonAfter={(
                                        // Валюта перевозчика своя: клиент платит рублями, перевозчик получает тенге — обычное дело.
                                        <Form.Item name="driverCostCurrency" noStyle initialValue="KZT">
                                            <CurrencySelect />
                                        </Form.Item>
                                    )}
                                />
                            </Form.Item>
                        </Field>
                    )}
                    <Field id="no-price-type" label="Тип ставки">
                        <Form.Item name="customerPriceType" initialValue="FIXED">
                            <FormSelect
                                id="no-price-type"
                                aria-label="Тип ставки"
                                className={s.shadSelect}
                                options={[
                                    { value: 'FIXED', label: 'За рейс' },
                                    { value: 'PER_TON', label: 'За тонну' },
                                    { value: 'PER_KM', label: 'За км' },
                                ]}
                            />
                        </Form.Item>
                    </Field>
                </div>

                {/* Маржа: при разных валютах и НДС — по курсу и с налогом, как на сервере. */}
                <Form.Item noStyle dependencies={['customerPrice', 'driverCost', 'currency', 'driverCostCurrency', 'pickupDate']}>
                    {({ getFieldValue }) => {
                        const cp = getFieldValue('customerPrice') || 0;
                        const dc = getFieldValue('driverCost') || 0;
                        if (cp && dc && showCustomerPriceField && showDriverCostField && !exchangeActive) {
                            return (
                                <div className="mt-2.5">
                                    <MarginPreview
                                        customerPrice={cp}
                                        driverCost={dc}
                                        customerCurrency={getFieldValue('currency')}
                                        carrierCurrency={getFieldValue('driverCostCurrency')}
                                        date={getFieldValue('pickupDate')}
                                        customerVatRate={customerTerms?.vatPayer ? Number(customerTerms?.vatRate ?? 0) : null}
                                        carrierVatRate={carrierTerms?.vatPayer ? Number(carrierTerms?.vatRate ?? 0) : null}
                                        customerLabel={customerPriceLabel}
                                        carrierLabel={driverCostLabel}
                                    />
                                </div>
                            );
                        }
                        return showCustomerPriceField && (showDriverCostField || exchangeActive)
                            ? <p className={s.margin} style={{ color: 'var(--nova-fg-3)' }}>Маржа посчитается, когда будут обе ставки</p>
                            : null;
                    }}
                </Form.Item>

                {/* Условия расчётов — из карточек сторон: логисту — чтобы говорить с перевозчиком, менять их здесь нельзя. */}
                {(customerTerms || carrierTerms) && (
                    <div className={s.note} style={{ marginTop: 10 }}>
                        <span className="shrink-0 font-semibold" style={{ color: 'var(--nova-fg)' }}>Расчёты</span>
                        <span className="min-w-0 flex-1">
                            {[
                                customerTerms && `заказчик — ${vatLabel(customerTerms.vatPayer, customerTerms.vatRate)}`
                                    + (paymentTermsLabel(customerTerms.customerPaymentDays, customerTerms.customerPaymentFrom, customerTerms.customerPaymentBanking)
                                        ? `, оплата ${paymentTermsLabel(customerTerms.customerPaymentDays, customerTerms.customerPaymentFrom, customerTerms.customerPaymentBanking)}`
                                        : ', срок оплаты не указан'),
                                carrierTerms && `перевозчик — ${vatLabel(carrierTerms.vatPayer, carrierTerms.vatRate)}`
                                    + (paymentTermsLabel(carrierTerms.carrierPaymentDays, carrierTerms.carrierPaymentFrom, carrierTerms.carrierPaymentBanking)
                                        ? `, платим ${paymentTermsLabel(carrierTerms.carrierPaymentDays, carrierTerms.carrierPaymentFrom, carrierTerms.carrierPaymentBanking)}`
                                        : ', срок оплаты не указан'),
                            ].filter(Boolean).join(' · ')}
                        </span>
                        <TooltipProvider delayDuration={150}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button type="button" aria-label="Откуда условия расчётов" className={s.removeX}>
                                        <Info className="size-3.5" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                    Берутся из карточки контрагента, раздел «Расчёты». Не заполнены —
                                    рейс дождётся бухгалтера, заводить его это не мешает.
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                )}
            </section>

            {/* ===== Маршрут ===== */}
            <section id="no-sec-route" data-section="route" className={s.section} aria-labelledby="no-h-route">
                <SectionHead
                    id="no-h-route"
                    title="Маршрут"
                    aside={(
                        <button type="button" className={s.addDashed} onClick={добавитьТочку}>
                            <Plus className="size-3.5" aria-hidden /> Добавить точку
                        </button>
                    )}
                />
                <ol className={s.route}>
                    {routePointsState.map((pt, i) => {
                        const адрес = точкаАдрес(pt);
                        const крайняя = i === 0 || i === routePointsState.length - 1;
                        const погрузкаСДатой = pt.pointType === 'PICKUP' && routePointsState.findIndex((p) => p.pointType === 'PICKUP') === i;
                        const errAddr = ошибка(`point-${i}`);
                        const errDate = погрузкаСДатой && попыткаОтправки && !watchedPickupDate ? 'Укажите, когда забирать груз' : null;
                        const вид = pt.pointType === 'PICKUP' ? 'Погрузка' : pt.pointType === 'DELIVERY' ? 'Выгрузка' : 'Догрузка';
                        return (
                            <li key={i} className={s.point}>
                                {i < routePointsState.length - 1 && <span className={s.pointLine} aria-hidden />}
                                <span className={cn(s.pointNum, i === 0 && s.pointNumFirst, !крайняя && s.pointNumMid)}>{i + 1}</span>
                                <div className={s.pointKindCell}>
                                    {крайняя
                                        ? <span className={s.pointKind}>{вид}</span>
                                        : (
                                            <button
                                                type="button"
                                                className={s.pointKindBtn}
                                                aria-label={`Точка ${i + 1}: ${вид.toLowerCase()} — сменить`}
                                                onClick={() => {
                                                    const next = [...routePointsState];
                                                    next[i] = { ...next[i], pointType: pt.pointType === 'DELIVERY' ? 'ADDITIONAL_PICKUP' : 'DELIVERY' };
                                                    setRoutePointsState(next);
                                                }}
                                            >
                                                {вид}<ChevronsUpDown className="size-3.5" style={{ color: 'var(--nova-fg-3)' }} aria-hidden />
                                            </button>
                                        )}
                                </div>
                                <div className={s.pointAddr}>
                                    <AddressCombo
                                        id={`no-point-${i}`}
                                        groups={getLocationOptions()}
                                        value={pt.id}
                                        valueTitle={адрес.title}
                                        valueSub={адрес.sub}
                                        ariaLabel={`Адрес точки ${i + 1}: ${вид.toLowerCase()}`}
                                        emptyText={selectedCustomer ? 'У заказчика пока нет адресов. Добавьте новый — он сохранится за этим заказчиком.' : undefined}
                                        invalid={!!errAddr}
                                        describedBy={errAddr ? `no-point-${i}-err` : undefined}
                                        autoOpen={открытьТочку === i}
                                        onOpened={() => setОткрытьТочку(null)}
                                        onCreateNew={(q) => {
                                            setActiveRoutePointIndex(i);
                                            setНовыйАдрес(q);
                                            setQuickLocationModalOpen(true);
                                        }}
                                        onSelect={(val) => выбратьАдрес(i, val)}
                                    />
                                </div>
                                {погрузкаСДатой ? (
                                    <div className={cn(s.tallPicker, s.pointDate)} data-guide="wizard-pickup-date">
                                        <Form.Item name="pickupDate" className={s.noHelp} rules={[{ required: true, message: 'Укажите, когда забирать груз' }]} validateStatus={errDate ? 'error' : undefined}>
                                            <DateField
                                                id="no-pickup-date"
                                                style={{ width: '100%' }}
                                                format="DD.MM.YYYY HH:mm"
                                                showTime={{ format: 'HH:mm' }}
                                                placeholder="Дата и время"
                                                aria-label="Дата и время погрузки"
                                            />
                                        </Form.Item>
                                    </div>
                                ) : (
                                    <div className={cn(s.tallPicker, s.pointDate)}>
                                        <DateField
                                            style={{ width: '100%' }}
                                            format="DD.MM.YYYY HH:mm"
                                            showTime={{ format: 'HH:mm' }}
                                            placeholder="Дата · необязательно"
                                            aria-label={`Дата точки ${i + 1}`}
                                            value={pt.date ? dayjs(pt.date) : null}
                                            onChange={(d: Dayjs | null) => {
                                                const next = [...routePointsState];
                                                next[i] = { ...next[i], date: d ? d.toISOString() : null };
                                                setRoutePointsState(next);
                                            }}
                                        />
                                    </div>
                                )}
                                <div className={s.pointAct}>
                                    {!крайняя && (
                                        <button
                                            type="button"
                                            className={s.iconBtn}
                                            aria-label={`Удалить точку ${i + 1}`}
                                            onClick={() => setRoutePointsState(routePointsState.filter((_, j) => j !== i))}
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    )}
                                </div>
                                <div className={s.pointExtra}>
                                    {(errAddr || errDate) && (
                                        <div className={s.pointErr}>
                                            <FieldError id={`no-point-${i}-err`}>{[errAddr, errDate].filter(Boolean).join(' · ')}</FieldError>
                                        </div>
                                    )}
                                    {/* Почта, закреплённая за адресом: куда слать доверенность. */}
                                    {pt.id && (
                                        <div className={s.emails}>
                                            <RoutePointEmails
                                                locationId={pt.id}
                                                value={pt.emails ?? []}
                                                onChange={(emails) => {
                                                    const next = [...routePointsState];
                                                    next[i] = { ...next[i], emails };
                                                    setRoutePointsState(next);
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </section>

            {/* ===== Груз ===== */}
            <section id="no-sec-cargo" data-section="cargo" className={s.section} aria-labelledby="no-h-cargo">
                <SectionHead id="no-h-cargo" title="Груз" />
                <div className={s.gridCargo}>
                    <div className={s.field} data-guide="wizard-cargo">
                        <div className={s.labelRow}><label htmlFor="no-nature" className={s.label}>Характер груза</label></div>
                        <Form.Item
                            name="natureOfCargo"
                            /**
                             * У новой заявки характер груза спрашиваем, у правки — нет: поле появилось позже
                             * самих заявок, и требовать его задним числом значило бы мешать поправить ставку.
                             */
                            rules={editingId ? [] : [{ required: true, message: 'Укажите, что везём — например, «Продукты питания»' }]}
                        >
                            <AutoComplete
                                id="no-nature"
                                placeholder="Выберите или впишите свой"
                                options={cargoCategories.map(cat => ({
                                    label: cat.name,
                                    options: (cat.types || []).map((t: any) => ({ value: t.name, label: t.name })),
                                }))}
                                filterOption={(input, option: any) =>
                                    String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                            />
                        </Form.Item>
                    </div>
                    <Field id="no-weight" label="Вес">
                        <Form.Item name="cargoWeight">
                            <InputNumber<number> id="no-weight" min={0} suffix="кг" placeholder="0" formatter={(v) => String(v ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} parser={(v) => Number((v || '').replace(/\s/g, '')) || 0} />
                        </Form.Item>
                    </Field>
                    <Field id="no-volume" label="Объём">
                        <Form.Item name="cargoVolume">
                            <InputNumber<number> id="no-volume" min={0} suffix="м³" placeholder="0" decimalSeparator="," />
                        </Form.Item>
                    </Field>
                </div>
                <PackagingField cargo={cargo} onCargo={setCargo} />
                <PlacesAndSize cargo={cargo} onCargo={setCargo} onShowDims={setShowDims} />
            </section>

            {/* ===== Кузов и загрузка ===== */}
            <section id="no-sec-truck" data-section="cargo" className={s.section} aria-labelledby="no-h-truck">
                <SectionHead id="no-h-truck" title="Кузов и загрузка" />
                {кузов}
            </section>

            {/* ===== Водитель и транспорт ===== */}
            <section id="no-sec-driver" data-section="driver" className={s.section} aria-labelledby="no-h-driver">
                <SectionHead id="no-h-driver" title="Водитель и транспорт" optional />
                {searchingOnExchange ? (
                    <div className={s.dashed}>
                        <Users className="size-4 shrink-0" aria-hidden />
                        <span>Водителя и машину укажет перевозчик, когда возьмёт заявку с биржи</span>
                    </div>
                ) : isCarrierOnPlatform ? (
                    <div className={cn(s.note, s.notePos)}>
                        <CircleCheck className="mt-px size-4 shrink-0" aria-hidden />
                        Перевозчик зарегистрирован на платформе — водителя на заявку он назначит сам.
                    </div>
                ) : !selectedCarrier ? (
                    <div className={s.dashed}>
                        <Users className="size-4 shrink-0" aria-hidden />
                        <span>Сначала выберите перевозчика — водители будут его</span>
                    </div>
                ) : (
                    <>
                        {selectedCarrier === MY_COMPANY_VALUE && vehicles.length > 0 && (
                            <div className="mb-4">
                                <Field id="no-fleet" label="Машина из автопарка" note="подставит госномера">
                                    <ChoiceField
                                        aria-label="Машина из автопарка"
                                        title="Машина из автопарка"
                                        placeholder={vehiclesLoading ? 'Загружаем автопарк…' : 'Выберите транспортное средство'}
                                        searchPlaceholder="Модель или госномер"
                                        value={машинаИзПарка}
                                        onChange={(v) => { setМашинаИзПарка(v); if (v) handleVehicleSelect(v); }}
                                        allowClear
                                        clearLabel="Не выбрана"
                                        groups={[{
                                            label: 'Автопарк',
                                            items: vehicles.map(v => ({
                                                id: v.id,
                                                title: `${v.model} (${v.plate})`,
                                                subtitle: v.trailerNumber ? `прицеп ${v.trailerNumber}` : undefined,
                                            })),
                                        }]}
                                    />
                                </Field>
                            </div>
                        )}
                        <div className={s.gridDriver}>
                            <Field id="no-driver" label="Водитель">
                                {/* Вся база водителей: сверху — кто уже ездил за этого перевозчика. */}
                                <Form.Item name="driverId" noStyle>
                                    <DriverPicker
                                        drivers={drivers}
                                        carrierId={перевозчикId}
                                        ownTransport={selectedCarrier === MY_COMPANY_VALUE}
                                        loading={driversLoading}
                                        onChange={(v) => { handleDriverSelect(v); setАнкетаОткрыта(v === NEW_DRIVER); }}
                                        renderField={(api) => (
                                            <InlineCombo
                                                id="no-driver"
                                                round
                                                value={selectedDriverId || undefined}
                                                valueTitle={selectedDriverId === NEW_DRIVER ? 'Новый водитель' : водитель ? [водитель.lastName, водитель.firstName, водитель.middleName].filter(Boolean).join(' ') : undefined}
                                                valueSub={водитель?.phone || undefined}
                                                placeholder={driversLoading && !drivers.length ? 'Загружаем базу водителей…' : 'Выберите водителя из базы'}
                                                searchPlaceholder="ФИО, телефон или госномер"
                                                items={api.groups.flatMap((g) => g.items).map((it) => ({ id: it.id, title: it.title, subtitle: it.subtitle, keywords: it.keywords }))}
                                                recentKey="driver"
                                                loading={driversLoading && !drivers.length}
                                                groupTitle={api.groups.length > 1 || перевозчикId ? api.groups[0]?.label : undefined}
                                                groupItems={api.groups.length > 1 ? api.groups[0]?.items.map((it) => ({ id: it.id, title: it.title, subtitle: it.subtitle, keywords: it.keywords })) : undefined}
                                                extra={{ label: 'Новый водитель — заполнить данные', onPick: () => { handleDriverSelect(NEW_DRIVER); form.setFieldValue('driverId', NEW_DRIVER); setАнкетаОткрыта(true); } }}
                                                directoryLabel={(q) => (q ? `Не нашли «${q}» — открыть базу водителей` : (api.count ? `Открыть базу водителей · ${api.count} ${склон(api.count, 'водитель', 'водителя', 'водителей')}` : 'Открыть базу водителей'))}
                                                onOpenDirectory={api.open}
                                                onSelect={(v) => { form.setFieldValue('driverId', v); handleDriverSelect(v); setАнкетаОткрыта(false); }}
                                                onClear={убратьВодителя}
                                                clearLabel="Убрать водителя — назначить позже"
                                            />
                                        )}
                                    />
                                </Form.Item>
                            </Field>
                            <Field id="no-plate" label="Тягач">
                                <Form.Item name="vehiclePlate" rules={[{ required: selectedDriverId === NEW_DRIVER, message: 'Введите госномер' }]}>
                                    <UiInput id="no-plate" className={cn(FIELD, 'uppercase placeholder:normal-case')} placeholder="Госномер" />
                                </Form.Item>
                            </Field>
                            <Field id="no-trailer" label="Прицеп">
                                <Form.Item name="trailerNumber">
                                    <UiInput id="no-trailer" className={cn(FIELD, 'uppercase placeholder:normal-case')} placeholder="Госномер" />
                                </Form.Item>
                            </Field>
                        </div>
                        {водитель && <p className={s.hint} style={{ marginTop: 8 }}>Номера тягача и прицепа подставлены из базы — их можно поправить</p>}
                        {водительЧужой && (
                            <p className={s.warning} style={{ marginTop: 6 }}>
                                <CircleAlert className="size-3.5 shrink-0" aria-hidden />{водительЧужой}
                            </p>
                        )}
                        {водитель && !анкетаОткрыта && (
                            <button type="button" className={s.linkBtn} style={{ marginTop: 4 }} onClick={() => setАнкетаОткрыта(true)}>
                                <Plus className="size-3.5" aria-hidden /> Паспорт, телефон и машина водителя
                            </button>
                        )}
                        {данныеВодителя}
                    </>
                )}
            </section>

            {/* ===== Особые условия ===== */}
            <section id="no-sec-extra" data-section="extra" className={s.section} aria-labelledby="no-h-extra">
                <SectionHead id="no-h-extra" title="Особые условия" optional />
                <SpecialConditions cargo={cargo} onCargo={setCargo} />
            </section>
        </Form>
    );

    const созданоЭкран = создано && (
        <div className={s.screen}>
            <div className={s.screenCard}>
                <span className={s.screenIcon}><Check className="size-7" strokeWidth={2.5} aria-hidden /></span>
                <h2 className={s.screenTitle}>{создано.published ? 'Заявка создана и опубликована на бирже' : 'Заявка создана'}</h2>
                <dl className={s.screenDl}>
                    {создано.rows.map((r) => (
                        <Fragment key={r.k}><dt>{r.k}</dt><dd>{r.v}</dd></Fragment>
                    ))}
                </dl>
                <div className={s.btnRow}>
                    <button type="button" className={s.btn} onClick={onRestart}>Создать ещё одну</button>
                    <button type="button" className={cn(s.btn, s.btnStrong)} onClick={onCreated}>Готово</button>
                </div>
            </div>
        </div>
    );

    const черновикЭкран = !editingId && черновикОт && !черновикПринят && (
        <div className={s.screen} style={{ background: 'var(--nova-surface-2)' }}>
            <div className={cn(s.screenCard, s.screenCardSm)} data-testid="order-draft-restored" role="status">
                <h2 className={cn(s.screenTitle, s.screenTitleSm)}>Черновик сохранён</h2>
                <p className={s.screenText}>Заявка от {когдаСохранён(черновикОт)} — всё, что вы ввели, на месте.</p>
                <div className={s.btnRow}>
                    <button type="button" className={s.btn} onClick={начатьЗаново}>Начать заново</button>
                    <button type="button" className={cn(s.btn, s.btnStrong)} onClick={() => setЧерновикПринят(true)}>Продолжить черновик</button>
                </div>
            </div>
        </div>
    );

    return (
        <div
            className={s.root}
            data-order-wizard
            onKeyDown={(e) => {
                // Ctrl/Cmd + Enter — создать из любого поля (ТЗ, §10).
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !создано) {
                    e.preventDefault();
                    e.stopPropagation();
                    void отправить();
                }
            }}
        >
            <Header
                title={editingId ? `Правка заявки ${editingNumber}`.trim() : 'Новая заявка'}
                savedText={editingId ? undefined : создано ? 'Заявка создана' : черновикСохранён ? `Черновик сохранён · ${dayjs(черновикСохранён).format('HH:mm')}` : 'Черновик сохраняется автоматически'}
                savedDot={!editingId && !создано && !!черновикСохранён}
                scrolled={прокручено}
                orgs={myCompanies.map((c) => ({ id: c.id, name: c.name?.trim() || 'Без названия', bin: c.bin }))}
                orgId={selectedMyCompanyId}
                onOrg={выбратьОрганизацию}
                managerValue={responsibleChoice}
                managerPinned={[
                    { id: 'SELF', title: user?.firstName ? `${user.lastName || ''} ${user.firstName}`.trim() : 'Текущий пользователь', subtitle: 'Это вы' },
                    { id: 'NONE', title: 'Не назначать', subtitle: 'Заявку возьмёт любой менеджер' },
                ]}
                managerUsers={officeUsers
                    .filter((u) => u.id !== user?.id)
                    .map((u) => ({ id: u.id, title: `${u.lastName} ${u.firstName}`.trim(), subtitle: u.role === 'LOGISTICIAN' ? 'логист' : 'администратор' }))}
                onManager={setResponsibleChoice}
                onReset={editingId ? undefined : начатьЗаново}
            />

            {созданоЭкран || черновикЭкран || (
                <div className={s.body}>
                    <main ref={mainRef} className={s.main} onScroll={(e) => { setПрокручено((e.target as HTMLElement).scrollTop > 4); обновитьРаздел(); }}>
                        {форма}
                    </main>
                    <Summary
                        items={summaryItems}
                        current={текущийРаздел}
                        onGo={перейтиК}
                        errorsCount={числоОшибок}
                        submitted={попыткаОтправки}
                        ctaText={ctaText}
                        onSubmit={() => void отправить()}
                        busy={submitting}
                        ctaNote={editingId ? undefined : 'Закроете окно — черновик останется'}
                    />
                    <div className={s.mobileBar}>
                        <span className={s.counter}>{summaryItems.filter((i) => !i.optional && i.status === 'done').length} из {summaryItems.filter((i) => !i.optional).length}</span>
                        <SubmitBlock compact errorsCount={числоОшибок} submitted={попыткаОтправки} ctaText={ctaText} onSubmit={() => void отправить()} busy={submitting} />
                    </div>
                </div>
            )}

            {/*
              * Заведение контрагента прямо из заявки — то же окно,
              * что в справочнике, чтобы не заводить фирму дважды.
              */}
            <Modal
                title="Новый контрагент"
                open={quickPartnerModalOpen}
                onCancel={() => { setQuickPartnerModalOpen(false); quickPartnerForm.resetFields(); }}
                onOk={() => quickPartnerForm.submit()}
                confirmLoading={quickPartnerLoading}
                okText="Создать"
                cancelText="Отмена"
                {...ОКНО_КОНТРАГЕНТА}
            >
                <Form
                    form={quickPartnerForm}
                    layout="vertical"
                    onFinish={handleCreateQuickPartner}
                    onValuesChange={(changed) => подставитьПоБин(changed, quickPartnerForm)}
                >
                    {/* Ответственного при заведении не показываем: им становится тот, кто завёл, — так решает сервер. */}
                    <PartnerFormFields />
                </Form>
            </Modal>

            <QuickCreateLocationModal
                open={quickLocationModalOpen}
                initialName={новыйАдрес}
                onCancel={() => {
                    setQuickLocationModalOpen(false);
                    setActiveRoutePointIndex(null);
                }}
                onSuccess={handleNewLocationSuccess}
                customerCompany={currentCustomerCompany}
                carrierCompany={currentCarrierCompany}
            />
        </div>
    );
}
