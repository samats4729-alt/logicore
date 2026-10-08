'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { Form, InputNumber, Modal, AutoComplete } from 'antd';
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input as UiInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSelect } from './FormSelect';
import styles from './OrderWizard.module.css';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { MarginSummary } from '@/components/orders/MarginSummary';
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
}

import { RoutePointEmails, parseEmails } from '@/components/orders/RoutePointEmails';
import { CargoComposition } from '@/components/orders/CargoComposition';
import { AddressPicker } from '@/components/orders/AddressPicker';
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
import { ChoiceField } from './ChoiceField';
import { DRIVER_CARD_FIELDS, alreadyExistsMessage, fetchDriverPool, tripVehicle, type PoolDriver } from '@/lib/driver-pool';

interface LocationState {
    city: string;
    address: string;
    id?: string;
    latitude?: number;
    longitude?: number;
    /** Почта, закреплённая за адресом: куда слать доверенность. */
    emails?: string[];
}

/** Типы точек маршрута: их всего три, показываем пилюлями. */
const POINT_TYPES = [
    { key: 'PICKUP', label: 'Погрузка' },
    { key: 'ADDITIONAL_PICKUP', label: 'Доп. погрузка' },
    { key: 'DELIVERY', label: 'Выгрузка' },
];

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

/** Подпись поля — как в макете: мелко, приглушённо. */
const LABEL = 'text-xs font-medium text-muted-foreground';
/** Поле ввода shadcn в размер полей мастера. */
const FIELD = 'lc-ui-field h-8 rounded-lg text-[13px] md:text-[13px]';
/** Многострочное поле — тем же видом, что и поле ввода. */
const TEXTAREA = 'lc-ui-field flex min-h-16 w-full rounded-lg border border-solid border-input bg-transparent px-3 py-2 text-[13px] text-foreground outline-none [font-family:inherit] placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring';

type RoleTone = 'ok' | 'info' | 'warn' | 'muted';
const ROLE_TONE: Record<RoleTone, string> = {
    ok: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
    warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    muted: 'border-border bg-muted/50 text-muted-foreground',
};

/** Раздел шага: заголовок, пояснение и поля под ними. */
function Section({ title, hint, first, children }: { title: string; hint?: string; first?: boolean; children: React.ReactNode }) {
    return (
        <section className={cn('grid gap-3', !first && 'mt-6')}>
            <div>
                <div className="text-[13px] font-semibold text-foreground">{title}</div>
                {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
            </div>
            {children}
        </section>
    );
}

function SubTitle({ children }: { children: React.ReactNode }) {
    return <div className="mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>;
}

/**
 * «Сбросить» — забыть набранное. Набранное не вернуть, поэтому с
 * подтверждением прямо на кнопке: первое нажатие спрашивает, второе
 * сбрасывает; через несколько секунд кнопка возвращается как была.
 */
function ResetButton({ onConfirm }: { onConfirm: () => void }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = window.setTimeout(() => setArmed(false), 4000);
        return () => window.clearTimeout(t);
    }, [armed]);
    return (
        <Button
            variant="ghost"
            size="sm"
            className={cn('h-8 gap-1.5 rounded-lg px-2.5 text-[13px] font-normal', armed && 'text-destructive hover:text-destructive')}
            onClick={() => (armed ? onConfirm() : setArmed(true))}
        >
            <RotateCcw className="size-3.5" /> {armed ? 'Сбросить всё?' : 'Сбросить'}
        </Button>
    );
}

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
export function OrderWizard({ editId: editIdProp, fromId: fromIdProp, quoteRequestId: quoteIdProp, onClose, onCreated, onSaved, onRestart }: OrderWizardProps) {
    const { user } = useAuthStore();
    const router = useRouter();
    const [form] = Form.useForm();
    const [quickPartnerForm] = Form.useForm();

    // Wizard step
    const [currentStep, setCurrentStep] = useState(0);

    // Data
    const [locations, setLocations] = useState<Location[]>([]);
    const [fetchedPartners, setFetchedPartners] = useState<Partner[]>([]);
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

    const showCustomerPriceField = !isMeCustomer || (isMeCustomer && isMeCarrier);
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
                longitude: newLoc.longitude
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
            }));
            const combined = [...partnersList, ...externalList];
            setFetchedPartners(combined);
            if (profileRes.data?.name) {
                setMyCompanyName(profileRes.data.name);
            }
        } catch (e: any) { reportLoadFailure('список контрагентов', e); }
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

        const customerLocs = locations.filter(l => customerCompanyId && (l as any).companyId === customerCompanyId);
        const carrierLocs = locations.filter(l => carrierCompanyId && (l as any).companyId === carrierCompanyId);
        const categorizedIds = new Set([...customerLocs.map(l => l.id), ...carrierLocs.map(l => l.id)]);
        const otherLocs = locations.filter(l => !categorizedIds.has(l.id));

        const groups: Array<{ label: string; options: Location[] }> = [];

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
        if (isMeCustomer && isMeCarrier) return { text: 'Вы и заказчик, и перевозчик — перевозка своими силами', tone: 'info' };
        if (isMeCustomer && isMarketplace) return { text: 'Вы — заказчик. Заявка будет опубликована на бирже', tone: 'info' };
        if (isMeCustomer && selectedCarrier) return { text: 'Вы — заказчик. Перевозку выполняет контрагент', tone: 'ok' };
        if (isMeCustomer && !selectedCarrier) return { text: 'Вы — заказчик. Выберите перевозчика', tone: 'warn' };
        if (isMeCarrier && selectedCustomer) return { text: 'Вы — перевозчик. Заказ от контрагента', tone: 'ok' };
        if (!isMeCustomer && !isMeCarrier && selectedCustomer && selectedCarrier) return { text: 'Вы — посредник между заказчиком и перевозчиком', tone: 'info' };
        if (selectedCustomer && !selectedCarrier) return { text: 'Выберите перевозчика', tone: 'warn' };
        return { text: 'Укажите стороны сделки', tone: 'muted' };
    };

    // Validate current step before proceeding
    const validateStep = async () => {
        if (currentStep === 0) { // Parties
            if (!selectedCustomer) {
                toast.error('Укажите заказчика');
                return false;
            }
            if (!selectedCarrier) {
                toast.error('Укажите перевозчика');
                return false;
            }
            if (isOwnOrExternalCarrier && selectedDriverId === NEW_DRIVER) {
                try {
                    await form.validateFields(['lastName', 'firstName', 'phone', 'vehiclePlate']);
                    return true;
                } catch {
                    return false;
                }
            }
            return true;
        }
        if (currentStep === 1) { // Route
            // Validate route
            const pickupDate = form.getFieldValue('pickupDate');
            if (!pickupDate) {
                toast.error('Укажите дату погрузки');
                return false;
            }
            const hasPickup = routePointsState.some(p => p.pointType === 'PICKUP' && (p.id || p.city));
            const hasDelivery = routePointsState.some(p => p.pointType === 'DELIVERY' && (p.id || p.city));
            if (!hasPickup) { toast.error('Укажите точку погрузки'); return false; }
            if (!hasDelivery) { toast.error('Укажите точку выгрузки'); return false; }
            return true;
        }
        if (currentStep === 2) { // Cargo
            try {
                await form.validateFields(['natureOfCargo']);
                return true;
            } catch { return false; }
        }
        return true;
    };

    const goNext = async () => {
        const valid = await validateStep();
        if (valid) setCurrentStep(currentStep + 1);
    };

    const goBack = () => setCurrentStep(currentStep - 1);

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

            let finalDriverId: string | undefined = selectedDriverId || undefined;

            if (isOwnOrExternalCarrier) {
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
                    expectedDate: p.pointType === 'PICKUP' ? pickupDateStr : undefined
                });
            }

            if (routePoints.length < 2) {
                toast.error('Укажите минимум 2 точки маршрута');
                setSubmitting(false);
                return;
            }

            // Build order payload based on selected parties
            const finalCustomerPrice = showCustomerPriceField ? values.customerPrice : values.driverCost;
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
                toast.success('Заявка сохранена');
                onSaved(editingId);
            } else {
                await api.post('/orders', orderData);
                // Заявка заведена — черновик своё отслужил. Иначе следующая
                // новая заявка открылась бы с данными этой.
                черновикЗакрыт.current = true;
                if (черновикКлюч) clearDraft(черновикКлюч);
                toast.success('Заявка создана!');
                onCreated();
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message
                || (editingId ? 'Не удалось сохранить заявку' : 'Ошибка создания заявки'));
        } finally {
            setSubmitting(false);
        }
    };

    const roleInfo = getRoleDescription();

    // Название организации, от лица которой создаётся заявка (обновляется при смене организации)
    const myCompanyLabel = myCompanies.find(c => c.id === selectedMyCompanyId)?.name?.trim() || myCompanyName || 'Моя компания';

    // =================== ШАГИ ===================

    const stepParties = (
        <div>
            {myCompanies.length > 1 && (
                <Section first title="Организация" hint="От чьего лица заводится заявка">
                    <FormSelect
                        aria-label="Организация"
                        value={selectedMyCompanyId}
                        onChange={(value) => {
                            setSelectedMyCompanyId(value || '');
                            setSelectedDriverId('');
                            form.setFieldsValue({
                                firstName: '', lastName: '', middleName: '', phone: '', iin: '',
                                vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
                                docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: '',
                                vehicleSelect: undefined, driverSelect: undefined
                            });
                        }}
                        options={myCompanies.map(c => ({ value: c.id, label: c.name?.trim() || 'Без названия' }))}
                    />
                </Section>
            )}

            <Section first={myCompanies.length <= 1} title="Стороны сделки" hint="Кто заказчик и кто выполняет перевозку">
                {/* Кто я в этой сделке — подсказка, что получилось из выбора сторон. */}
                <div className={cn('flex items-center gap-2 rounded-lg border border-solid px-3 py-2 text-[12.5px] font-medium', ROLE_TONE[roleInfo.tone])}>
                    <CircleCheck className="size-4 shrink-0" />
                    <span>{roleInfo.text}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5" data-guide="wizard-customer">
                        <Label className={LABEL}>Заказчик</Label>
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
                        />
                    </div>
                    <div className="grid gap-1.5" data-guide="wizard-carrier">
                        <Label className={LABEL}>Перевозчик</Label>
                        <PartnerPicker
                            role="CARRIER"
                            value={selectedCarrier || undefined}
                            onChange={(val) => {
                                setSelectedCarrier(val);
                                setSelectedDriverId('');
                                form.setFieldsValue({
                                    driverId: undefined,
                                    lastName: '', firstName: '', middleName: '', phone: '', iin: '',
                                    vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
                                    docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: ''
                                });
                            }}
                            partners={partners}
                            ownValue={MY_COMPANY_VALUE}
                            ownLabel={myCompanyLabel}
                            userId={user?.id}
                            scope={user?.companyId}
                            onAdd={() => открытьЗаведениеКонтрагента('CARRIER')}
                        />
                        {/* Биржа временно отключена до запуска (перевёрнутая цепочка ролей при takeOrder) */}
                    </div>
                </div>

                <div className="grid gap-1.5">
                    <Label className={LABEL}>Ответственный менеджер</Label>
                    {/* Сотрудников пять — выпадающий список, пятьдесят — окно с поиском. */}
                    <ChoiceField
                        aria-label="Ответственный менеджер"
                        title="Ответственный менеджер"
                        placeholder="Выберите менеджера"
                        searchPlaceholder="Фамилия или имя"
                        value={responsibleChoice}
                        onChange={(v) => setResponsibleChoice(v ?? 'SELF')}
                        pinned={[
                            {
                                id: 'SELF',
                                title: user?.firstName
                                    ? `${user.lastName || ''} ${user.firstName}`.trim()
                                    : 'Текущий пользователь',
                                subtitle: 'Это вы',
                                emphasis: true,
                            },
                            { id: 'NONE', title: 'Не назначать — заявку возьмёт любой менеджер' },
                        ]}
                        groups={[{
                            label: 'Сотрудники',
                            items: officeUsers
                                .filter(u => u.id !== user?.id)
                                .map(u => ({ id: u.id, title: `${u.lastName} ${u.firstName}${u.role === 'LOGISTICIAN' ? '' : ' (админ)'}` })),
                        }]}
                        chipSets={[[
                            { id: 'logist', label: 'Логисты', test: (item) => officeUsers.find(u => u.id === item.id)?.role === 'LOGISTICIAN' },
                            { id: 'admin', label: 'Администраторы', test: (item) => officeUsers.find(u => u.id === item.id)?.role !== 'LOGISTICIAN' },
                        ]]}
                    />
                    {responsibleChoice !== 'SELF' && responsibleChoice !== 'NONE' && (
                        <p className="m-0 text-xs text-muted-foreground">
                            Заявка будет закреплена за выбранным менеджером, вы останетесь её создателем и сохраните доступ
                        </p>
                    )}
                </div>

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
            </Section>

            <Section title="Ставки" hint="Стоимость перевозки. НДС и сроки оплаты подставятся из карточек сторон">
                {/* Ставки и тип оплаты — одной строкой: тип оплаты короткий
                    список, по умолчанию «за рейс» (владелец, 08.10.2026). */}
                <div className="flex flex-wrap items-start gap-x-3">
                    {showCustomerPriceField && (
                        <div className="min-w-[200px] flex-1">
                            <Form.Item name="customerPrice" label={customerPriceLabel}>
                                <MoneyInput
                                    addonAfter={(
                                        <Form.Item name="currency" noStyle initialValue="KZT">
                                            <CurrencySelect />
                                        </Form.Item>
                                    )}
                                />
                            </Form.Item>
                            {appliedTariff && (
                                <div className="-mt-2 mb-3 inline-flex items-center gap-1.5 rounded-md border border-solid border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11.5px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <CircleCheck className="size-3.5" /> Тариф ДС №{appliedTariff.agreement?.agreementNumber || '—'}
                                </div>
                            )}
                        </div>
                    )}
                    {showDriverCostField && (
                        <div className="min-w-[200px] flex-1">
                            <Form.Item name="driverCost" label={driverCostLabel}>
                                <MoneyInput
                                    addonAfter={(
                                        // Валюта перевозчика своя: рейс, где клиент платит
                                        // рублями, а перевозчик получает тенге, — обычное дело.
                                        <Form.Item name="driverCostCurrency" noStyle initialValue="KZT">
                                            <CurrencySelect />
                                        </Form.Item>
                                    )}
                                />
                            </Form.Item>
                        </div>
                    )}
                    <div className="w-36 shrink-0">
                        <Form.Item name="customerPriceType" label="Оплата" initialValue="FIXED">
                            <FormSelect
                                aria-label="Тип оплаты"
                                options={[
                                    { value: 'FIXED', label: 'За рейс' },
                                    { value: 'PER_KM', label: 'За км' },
                                    { value: 'PER_TON', label: 'За тонну' },
                                ]}
                            />
                        </Form.Item>
                    </div>
                </div>

                {/* Плановые даты оплаты платформа считает сама — по срокам из
                    карточек сторон. Условия показываем строкой: логисту они
                    нужны, чтобы разговаривать с перевозчиком, а менять их он
                    не может. */}
                {(customerTerms || carrierTerms) && (
                    <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-[12.5px]">
                        <div className="font-medium">Условия расчётов</div>
                        <div className="mt-0.5 text-muted-foreground">
                            {[
                                customerTerms && `заказчик — ${vatLabel(customerTerms.vatPayer, customerTerms.vatRate)}`
                                    + (paymentTermsLabel(customerTerms.customerPaymentDays, customerTerms.customerPaymentFrom)
                                        ? `, оплата ${paymentTermsLabel(customerTerms.customerPaymentDays, customerTerms.customerPaymentFrom)}`
                                        : ', срок оплаты не указан'),
                                carrierTerms && `перевозчик — ${vatLabel(carrierTerms.vatPayer, carrierTerms.vatRate)}`
                                    + (paymentTermsLabel(carrierTerms.carrierPaymentDays, carrierTerms.carrierPaymentFrom)
                                        ? `, платим ${paymentTermsLabel(carrierTerms.carrierPaymentDays, carrierTerms.carrierPaymentFrom)}`
                                        : ', срок оплаты не указан'),
                            ].filter(Boolean).join(' · ')}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                            Заполняются в карточке контрагента, раздел «Расчёты». Не заполнены —
                            рейс дождётся бухгалтера, заводить его это не мешает.
                        </div>
                    </div>
                )}

                {/* Маржа по введённым ставкам */}
                <Form.Item noStyle dependencies={['customerPrice', 'driverCost']}>
                    {({ getFieldValue }) => {
                        const cp = getFieldValue('customerPrice') || 0;
                        const dc = getFieldValue('driverCost') || 0;
                        // НДС берём из карточек сторон — там же, откуда его возьмёт
                        // сервер при сохранении. Иначе маржа в мастере и маржа в
                        // карточке рейса расходились бы на сумму налога.
                        const hasVat = !!customerTerms?.vatPayer;
                        const vatRate = Number(customerTerms?.vatRate ?? 0);
                        const executorHasVat = !!carrierTerms?.vatPayer;
                        const executorVatRate = Number(carrierTerms?.vatRate ?? 0);

                        if (cp && dc && showCustomerPriceField && showDriverCostField) {
                            const cpNet = hasVat ? (cp / (1 + vatRate / 100)) : cp;
                            const dcNet = executorHasVat ? (dc / (1 + executorVatRate / 100)) : dc;
                            const margin = Math.round((cpNet - dcNet) * 100) / 100;
                            const marginPercent = cpNet > 0 ? Math.round((margin / cpNet) * 100) : 0;

                            return (
                                <MarginSummary
                                    customerLabel={customerPriceLabel}
                                    customerNet={cpNet}
                                    carrierLabel={driverCostLabel}
                                    carrierNet={dcNet}
                                    margin={margin}
                                    marginPercent={marginPercent}
                                    netOfVat={hasVat || executorHasVat}
                                />
                            );
                        }
                        return null;
                    }}
                </Form.Item>
            </Section>

            {isOwnOrExternalCarrier && (
                <Section title="Водитель и транспорт" hint="Можно назначить сейчас или позже — это необязательно">
                    {selectedCarrier === MY_COMPANY_VALUE && vehicles.length > 0 && (
                        <Form.Item label="Машина из автопарка (необязательно)">
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
                        </Form.Item>
                    )}

                    {/* Вся база водителей, а не только водители этого ИП:
                        сверху — кто уже ездил за него, ниже — остальные. */}
                    <Form.Item name="driverId" label="Водитель (необязательно)">
                        <DriverPicker
                            drivers={drivers}
                            carrierId={selectedCarrier === MY_COMPANY_VALUE ? (user?.companyId ?? null) : selectedCarrier}
                            ownTransport={selectedCarrier === MY_COMPANY_VALUE}
                            loading={driversLoading}
                            onChange={handleDriverSelect}
                        />
                    </Form.Item>

                    {selectedDriverId && (
                        <div className="rounded-lg border border-solid border-border p-3 pb-0">
                            <SubTitle>Данные водителя</SubTitle>
                            <div className="grid gap-x-3 sm:grid-cols-3">
                                <Form.Item name="lastName" label="Фамилия" rules={[{ required: selectedDriverId === NEW_DRIVER, message: 'Введите фамилию' }]}>
                                    <UiInput className={FIELD} placeholder="Иванов" />
                                </Form.Item>
                                <Form.Item name="firstName" label="Имя" rules={[{ required: selectedDriverId === NEW_DRIVER, message: 'Введите имя' }]}>
                                    <UiInput className={FIELD} placeholder="Иван" />
                                </Form.Item>
                                <Form.Item name="middleName" label="Отчество">
                                    <UiInput className={FIELD} placeholder="Иванович" />
                                </Form.Item>
                            </div>
                            <div className="grid gap-x-3 sm:grid-cols-2">
                                <Form.Item name="phone" label="Телефон" rules={[{ required: selectedDriverId === NEW_DRIVER, message: 'Введите телефон' }]}>
                                    <UiInput className={FIELD} placeholder="+77001234567" />
                                </Form.Item>
                                <Form.Item name="iin" label="ИИН">
                                    <UiInput className={FIELD} placeholder="123456789012" maxLength={12} />
                                </Form.Item>
                            </div>

                            <SubTitle>Документ</SubTitle>
                            <div className="grid gap-x-3 sm:grid-cols-2">
                                <Form.Item name="docType" label="Тип документа">
                                    <FormSelect
                                        placeholder="Выберите документ"
                                        options={[
                                            { value: 'ID_CARD', label: 'Удостоверение личности' },
                                            { value: 'PASSPORT', label: 'Паспорт' },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item name="docNumber" label="Номер документа">
                                    <UiInput className={FIELD} placeholder="012345678" />
                                </Form.Item>
                            </div>
                            <div className="grid gap-x-3 sm:grid-cols-3">
                                <Form.Item name="docIssuedAt" label="Дата выдачи">
                                    <DateField style={{ width: '100%' }} />
                                </Form.Item>
                                <Form.Item name="docExpiresAt" label="Срок действия">
                                    <DateField style={{ width: '100%' }} />
                                </Form.Item>
                                <Form.Item name="docIssuedBy" label="Кем выдан">
                                    <UiInput className={FIELD} placeholder="МВД РК" />
                                </Form.Item>
                            </div>

                            <SubTitle>Машина</SubTitle>
                            <div className="grid gap-x-3 sm:grid-cols-2">
                                <Form.Item name="vehicleType" label="Тип транспорта">
                                    <FormSelect
                                        placeholder="Выберите тип кузова"
                                        options={VEHICLE_TYPES.map(t => ({ value: t, label: t }))}
                                    />
                                </Form.Item>
                                <Form.Item name="vehicleModel" label="Модель автомобиля">
                                    <UiInput className={FIELD} placeholder="Volvo FH12" />
                                </Form.Item>
                            </div>
                            <div className="grid gap-x-3 sm:grid-cols-2">
                                <Form.Item name="vehiclePlate" label="Госномер автомобиля" rules={[{ required: selectedDriverId === NEW_DRIVER, message: 'Введите госномер' }]}>
                                    <UiInput className={FIELD} placeholder="123 ABC 01" />
                                </Form.Item>
                                <Form.Item name="trailerNumber" label="Госномер прицепа">
                                    <UiInput className={FIELD} placeholder="1234 XX 01" />
                                </Form.Item>
                            </div>
                        </div>
                    )}
                </Section>
            )}

            {isCarrierOnPlatform && (
                <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-solid border-emerald-300 bg-emerald-50 px-3 py-2.5 text-[12.5px] font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <CircleCheck className="mt-px size-4 shrink-0" />
                    Перевозчик зарегистрирован на платформе. Он самостоятельно назначит водителя на эту заявку. Дальнейший ввод водителя не требуется.
                </div>
            )}
        </div>
    );

    const stepRoute = (
        <div>
            <Section first title="Дата и время погрузки">
                <Form.Item name="pickupDate" rules={[{ required: true, message: 'Укажите дату' }]} data-guide="wizard-pickup-date" className="max-w-xs" style={{ marginBottom: 0 }}>
                    <DateField
                        style={{ width: '100%' }}
                        format="DD.MM.YYYY HH:mm"
                        showTime={{ format: 'HH:mm' }}
                        placeholder="Выберите дату и время"
                    />
                </Form.Item>
            </Section>

            <Section title="Точки маршрута" hint="Погрузка, выгрузка и промежуточные точки по порядку">
                <div className="grid gap-2">
                    {routePointsState.map((pt, i) => {
                        const selected = locations.find((l) => l.id === pt.id);
                        const label = selected
                            ? `${selected.name}${selected.city ? `, ${selected.city}` : ''}, ${selected.address}`
                            : pt.address
                                ? `${pt.city ? `${pt.city}, ` : ''}${pt.address}`
                                : '';
                        return (
                            <div key={i} className="rounded-lg border border-solid border-border p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                                            i === 0 ? 'bg-foreground text-background' : 'border-2 border-solid border-foreground',
                                        )}>
                                            {i + 1}
                                        </span>
                                        {/* Тип точки — переключателем: вариантов три, выпадающий список тут лишний. */}
                                        <div className="inline-flex items-center rounded-lg bg-muted p-0.5">
                                            {POINT_TYPES.map((type) => {
                                                const active = pt.pointType === type.key;
                                                return (
                                                    <button
                                                        key={type.key}
                                                        type="button"
                                                        onClick={() => {
                                                            const next = [...routePointsState];
                                                            next[i].pointType = type.key;
                                                            setRoutePointsState(next);
                                                        }}
                                                        className={cn(
                                                            'h-6 cursor-pointer rounded-md border-0 px-2.5 text-[12px] [font-family:inherit] transition-colors',
                                                            active
                                                                ? 'bg-card font-medium text-foreground shadow-sm'
                                                                : 'bg-transparent text-muted-foreground hover:text-foreground',
                                                        )}
                                                    >
                                                        {type.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {routePointsState.length > 2 && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Убрать точку"
                                            className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                                            onClick={() => {
                                                const next = [...routePointsState];
                                                next.splice(i, 1);
                                                setRoutePointsState(next);
                                            }}
                                        >
                                            <X className="size-4" />
                                        </Button>
                                    )}
                                </div>

                                <AddressPicker
                                    groups={getLocationOptions()}
                                    valueId={pt.id}
                                    valueLabel={label}
                                    onCreateNew={() => {
                                        setActiveRoutePointIndex(i);
                                        setQuickLocationModalOpen(true);
                                    }}
                                    onSelect={(val) => {
                                        const newPts = [...routePointsState];
                                        if (!val) {
                                            newPts[i] = {
                                                ...newPts[i], city: '', address: '', id: undefined,
                                                latitude: undefined, longitude: undefined, emails: [],
                                            };
                                        } else {
                                            const loc = locations.find((l) => l.id === val);
                                            if (loc) {
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
                                                if (firstPickup?.city && lastDelivery?.city) {
                                                    lookupTariff(firstPickup.city, lastDelivery.city);
                                                }
                                            }
                                        }
                                        setRoutePointsState(newPts);
                                    }}
                                />

                                <RoutePointEmails
                                    locationId={pt.id}
                                    value={pt.emails ?? []}
                                    onChange={(emails) => {
                                        const newPts = [...routePointsState];
                                        newPts[i] = { ...newPts[i], emails };
                                        setRoutePointsState(newPts);
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>

                <Button
                    variant="outline"
                    className="h-8 w-full gap-1.5 rounded-lg border-dashed text-[13px] font-normal"
                    onClick={() => setRoutePointsState([...routePointsState, { city: '', address: '', pointType: 'ADDITIONAL_PICKUP' }])}
                >
                    <Plus className="size-3.5" /> Добавить точку
                </Button>
            </Section>
        </div>
    );

    const stepCargo = (
        <div>
            <Section first title="Груз">
                <div className="grid gap-x-3 sm:grid-cols-2">
                    <Form.Item
                        name="natureOfCargo"
                        label="Характер груза"
                        /**
                         * У новой заявки характер груза спрашиваем, у правки —
                         * нет. Поле появилось позже самих заявок, на сервере
                         * оно необязательное, и ни в одной заведённой заявке
                         * его нет. Требовать его при правке значило бы: чтобы
                         * поправить ставку, придумай задним числом характер
                         * груза, которого никто не спрашивал.
                         */
                        rules={editingId ? [] : [{ required: true, message: 'Выберите из списка или впишите свой вариант' }]}
                    >
                        <AutoComplete
                            placeholder="Выберите или впишите свой вариант..."
                            options={cargoCategories.map(cat => ({
                                label: cat.name,
                                options: (cat.types || []).map((t: any) => ({ value: t.name, label: t.name })),
                            }))}
                            filterOption={(input, option: any) =>
                                String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </Form.Item>
                    <Form.Item name="cargoType" label="Тип кузова">
                        <FormSelect
                            placeholder="Тент, реф…"
                            allowClear
                            options={VEHICLE_TYPES.map(t => ({ value: t, label: t }))}
                        />
                    </Form.Item>
                </div>
                <Form.Item name="cargoDescription" label="Описание груза" data-guide="wizard-cargo">
                    <textarea rows={2} className={TEXTAREA} placeholder="Мебель, 20 коробок, палеты..." />
                </Form.Item>
                <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
                    <Form.Item name="cargoWeight" label="Вес, кг">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                    <Form.Item name="cargoVolume" label="Объём, м³">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                    <Form.Item name="palletCount" label="Количество палет" hidden>
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                </div>

                <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px]">
                    <Checkbox checked={showDims} onCheckedChange={(c) => setShowDims(c === true)} />
                    Указать габариты груза (длина × ширина × высота, м)
                </label>
                {showDims && (
                    <div className="grid grid-cols-3 gap-x-3">
                        <Form.Item name="cargoLength" label="Длина, м">
                            <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" />
                        </Form.Item>
                        <Form.Item name="cargoWidth" label="Ширина, м">
                            <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" />
                        </Form.Item>
                        <Form.Item name="cargoHeight" label="Высота, м">
                            <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" />
                        </Form.Item>
                    </div>
                )}
            </Section>

            <Section title="Состав груза">
                <div className="rounded-lg border border-solid border-border p-3">
                    <CargoComposition value={cargo} onChange={setCargo} />
                </div>
            </Section>

            <Section title="Дополнительно">
                <Form.Item name="requirements" label="Что ещё важно водителю">
                    <textarea rows={2} className={TEXTAREA} placeholder="Ремни, коники, гидроборт, особые пожелания..." />
                </Form.Item>
            </Section>
        </div>
    );

    const steps = [
        { title: 'Стороны и ставки', content: stepParties },
        { title: 'Маршрут', content: stepRoute },
        { title: 'Груз', content: stepCargo },
    ];

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

    return (
        <div className={cn(styles.wizard, 'flex min-h-0 flex-1 flex-col')} data-order-wizard>
            {/* ===== Шапка: что за заявка и на каком шаге ===== */}
            <div className="border-0 border-b border-solid border-border px-5 pb-3 pt-4">
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <DialogTitle className="m-0 text-base font-semibold tracking-normal">
                            {editingId ? `Правка заявки ${editingNumber}`.trim() : 'Новая заявка'}
                        </DialogTitle>
                        <DialogDescription className="m-0 mt-0.5 text-[13px]">
                            Шаг {currentStep + 1} из {steps.length} · {steps[currentStep].title}
                            {/* Чтобы знали, что закрыть можно: набранное не пропадёт. */}
                            {!editingId && черновикСохранён && (
                                <span data-testid="order-draft-saved"> · черновик сохранён</span>
                            )}
                        </DialogDescription>
                    </div>
                    <DialogClose asChild>
                        <Button variant="ghost" size="icon" className="-mr-1.5 size-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground" aria-label="Закрыть">
                            <X className="size-4" />
                        </Button>
                    </DialogClose>
                </div>

                {/* Шаги. Пройденные кликабельны: вернуться к сторонам сделки
                    посреди груза — обычное дело. */}
                <div role="tablist" aria-label="Шаги заявки" className="mt-3 flex items-center gap-2">
                    {steps.map((step, idx) => {
                        const done = idx < currentStep;
                        const active = idx === currentStep;
                        return (
                            <div key={idx} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    disabled={idx > currentStep}
                                    onClick={() => { if (idx < currentStep) setCurrentStep(idx); }}
                                    // Якоря для ИИ-гида: он ведёт по мастеру шаг за шагом.
                                    data-guide={`wizard-step-${idx}`}
                                    className={cn(
                                        'flex shrink-0 items-center gap-2 border-0 bg-transparent p-0 text-[13px] [font-family:inherit]',
                                        done ? 'cursor-pointer text-foreground' : active ? 'cursor-default font-medium text-foreground' : 'cursor-default text-muted-foreground',
                                    )}
                                >
                                    <span className={cn(
                                        'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                                        done ? 'bg-foreground text-background' : active ? 'border-2 border-solid border-foreground' : 'border border-solid border-border',
                                    )}>
                                        {done ? <Check className="size-3.5" /> : idx + 1}
                                    </span>
                                    <span className="whitespace-nowrap">{step.title}</span>
                                </button>
                                {idx < steps.length - 1 && <span className={cn('h-px min-w-4 flex-1', done ? 'bg-foreground' : 'bg-border')} />}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ===== Поля ===== */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {!editingId && черновикОт && (
                    <div role="status" data-testid="order-draft-restored" className="mb-4 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                        <b className="font-medium text-foreground">Продолжаем незаконченную заявку</b> — черновик
                        сохранён {когдаСохранён(черновикОт)}. Всё, что вы успели ввести, на месте.
                    </div>
                )}

                {!profileComplete && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                        <CircleAlert className="mt-px size-4 shrink-0" />
                        <span>
                            {editingId ? 'Заявку можно сохранить сейчас' : 'Заявку можно создать сейчас'}, но для формирования документов (доверенности, счета)
                            заполните{' '}
                            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-medium text-foreground underline [font-family:inherit]" onClick={() => router.push('/company/settings')}>
                                профиль компании
                            </button>
                        </span>
                    </div>
                )}

                <Form form={form} layout="vertical" onValuesChange={() => setПравкаФормы((n) => n + 1)}>
                    {steps.map((step, idx) => (
                        <div key={idx} style={{ display: currentStep === idx ? 'block' : 'none' }}>
                            {step.content}
                        </div>
                    ))}
                </Form>
            </div>

            {/* ===== Кнопки ===== */}
            <div className="flex items-center gap-2 border-0 border-t border-solid border-border px-5 py-3">
                {/* Сбросить — забыть набранное и начать с пустой формы. Только у
                    новой заявки: у правки источник — сама заявка. */}
                {!editingId && <ResetButton onConfirm={начатьЗаново} />}
                <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 rounded-lg px-3 text-[13px] font-normal" onClick={onClose}>
                        Отмена
                    </Button>
                    {currentStep > 0 && (
                        <Button variant="outline" size="sm" className="h-8 gap-1 rounded-lg px-3 text-[13px] font-normal" onClick={goBack} data-guide="wizard-back">
                            <ArrowLeft className="size-3.5" /> Назад
                        </Button>
                    )}
                    {currentStep < steps.length - 1 ? (
                        <Button size="sm" className="h-8 gap-1 rounded-lg px-3 text-[13px]" onClick={goNext} data-guide="wizard-next">
                            Далее <ArrowRight className="size-3.5" />
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            className="h-8 gap-1.5 rounded-lg px-3 text-[13px]"
                            onClick={handleSubmit}
                            disabled={submitting || !selectedCustomer || !selectedCarrier}
                            data-guide="wizard-submit"
                        >
                            {submitting && <Loader2 className="size-3.5 animate-spin" />}
                            {editingId ? 'Сохранить заявку' : 'Создать заявку'}
                        </Button>
                    )}
                </div>
            </div>

            {/*
              * Заведение контрагента прямо из мастера заявки — то же окно,
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
                    {/* Ответственного при заведении не показываем: им становится
                        тот, кто завёл, — так решает сервер. */}
                    <PartnerFormFields />
                </Form>
            </Modal>

            <QuickCreateLocationModal
                open={quickLocationModalOpen}
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
