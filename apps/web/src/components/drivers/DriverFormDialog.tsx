'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateStringField } from '@/components/ui/DateField';
import { api } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { alreadyExistsMessage, driverKindLabel, type PoolDriver } from '@/lib/driver-pool';

/**
 * Водитель: добавить в список или поправить.
 *
 * Два вида водителей, и спрашиваем только это. Штатный работает у вас: он
 * появится и в «Сотрудниках», и ему можно выдать пароль от приложения.
 * Нештатный — любой другой: водитель ИП из справочника или человек со своей
 * фурой без ИП. Про него нужно одно: кто он, как с ним связаться и на какой
 * машине ездит.
 *
 * Вид и перевозчика выбирают только при добавлении. Перевести человека из
 * нештатных в штат — это приём на работу, а не правка карточки.
 */

type Kind = 'STAFF' | 'OTHER';

interface Values {
    lastName: string;
    firstName: string;
    middleName: string;
    phone: string;
    iin: string;
    vehiclePlate: string;
    trailerNumber: string;
    vehicleModel: string;
    vehicleType: string;
    docType: string;
    docNumber: string;
    docIssuedAt: string;
    docExpiresAt: string;
    docIssuedBy: string;
    password: string;
}

const EMPTY: Values = {
    lastName: '', firstName: '', middleName: '', phone: '', iin: '',
    vehiclePlate: '', trailerNumber: '', vehicleModel: '', vehicleType: '',
    docType: '', docNumber: '', docIssuedAt: '', docExpiresAt: '', docIssuedBy: '',
    password: '',
};

/** «2026-05-20T00:00:00.000Z» → «2026-05-20»: так дату ждёт поле. */
const день = (value?: string | null) => (value ? String(value).slice(0, 10) : '');

function fromDriver(d: PoolDriver): Values {
    return {
        lastName: d.lastName || '',
        firstName: d.firstName || '',
        middleName: d.middleName || '',
        phone: d.phone || '',
        iin: d.iin || '',
        vehiclePlate: d.vehiclePlate || '',
        trailerNumber: d.trailerNumber || '',
        vehicleModel: d.vehicleModel || '',
        vehicleType: d.vehicleType || '',
        docType: d.docType || '',
        docNumber: d.docNumber || '',
        docIssuedAt: день(d.docIssuedAt),
        docExpiresAt: день(d.docExpiresAt),
        docIssuedBy: d.docIssuedBy || '',
        password: '',
    };
}

export default function DriverFormDialog({
    open,
    onOpenChange,
    driver,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Есть — правим этого водителя; нет — добавляем нового. */
    driver?: PoolDriver | null;
    onSaved: () => void;
}) {
    const [kind, setKind] = useState<Kind>('OTHER');
    const [carrierId, setCarrierId] = useState('');
    const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([]);
    const [values, setValues] = useState<Values>(EMPTY);
    const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
    const [saving, setSaving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

    const editing = !!driver;

    useEffect(() => {
        if (!open) return;
        setValues(driver ? fromDriver(driver) : EMPTY);
        setKind('OTHER');
        setCarrierId('');
        setErrors({});
        setConfirmRemove(false);
        if (!driver) {
            // Перевозчики — только для нештатного, и только чтобы отметить,
            // от кого он: на рейс его всё равно можно поставить за любого.
            api.get('/external-companies')
                .then((res) => setCarriers((res.data || [])
                    .filter((c: any) => c.isCarrier)
                    .map((c: any) => ({ id: c.id, name: c.name }))))
                .catch(() => setCarriers([]));
        }
    }, [open, driver]);

    const set = (key: keyof Values, value: string) => {
        setValues((v) => ({ ...v, [key]: value }));
        if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const validate = () => {
        const next: Partial<Record<keyof Values, string>> = {};
        if (!values.lastName.trim()) next.lastName = 'Укажите фамилию';
        if (!values.firstName.trim()) next.firstName = 'Укажите имя';
        if (!values.phone.trim()) next.phone = 'Укажите телефон — по нему водителя находят и с ним связываются';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const payload = () => {
        const поле = (value: string) => value.trim() || undefined;
        return {
            lastName: values.lastName.trim(),
            firstName: values.firstName.trim(),
            middleName: поле(values.middleName),
            phone: values.phone.trim(),
            iin: поле(values.iin),
            vehiclePlate: поле(values.vehiclePlate),
            trailerNumber: поле(values.trailerNumber),
            vehicleModel: поле(values.vehicleModel),
            vehicleType: поле(values.vehicleType),
            docType: поле(values.docType),
            docNumber: поле(values.docNumber),
            docIssuedAt: поле(values.docIssuedAt),
            docExpiresAt: поле(values.docExpiresAt),
            docIssuedBy: поле(values.docIssuedBy),
            password: поле(values.password),
        };
    };

    const save = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            if (editing && driver) {
                await api.put(`/company/drivers/${driver.id}`, payload());
                toast.success('Данные водителя сохранены');
            } else {
                const тело = kind === 'STAFF'
                    ? payload()
                    : carrierId
                        ? { ...payload(), companyId: carrierId }
                        : { ...payload(), independent: true };
                const res = await api.post('/company/drivers', тело);
                if (res.data?.alreadyExists) {
                    toast.info(alreadyExistsMessage(res.data, { вСписке: true }));
                } else {
                    toast.success('Водитель добавлен — его уже можно ставить на рейсы');
                }
            }
            onSaved();
            onOpenChange(false);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось сохранить водителя. Проверьте связь и попробуйте ещё раз');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!driver) return;
        setSaving(true);
        try {
            await api.delete(`/company/drivers/${driver.id}`);
            toast.success('Водитель убран из списка');
            onSaved();
            onOpenChange(false);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось убрать водителя');
        } finally {
            setSaving(false);
        }
    };

    const вид = driver ? driverKindLabel(driver) : null;
    const штатный = editing ? driver?.kind === 'STAFF' : kind === 'STAFF';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Прокручивается только середина: заголовок и кнопки на месте,
                сколько бы полей ни было.

                Esc при открытом календаре закрывает календарь, а не окно:
                календарь живёт вне окна, и без этого одно нажатие стирало
                всё набранное. */}
            <DialogContent
                className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
                onEscapeKeyDown={(e) => {
                    if (document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')) {
                        e.preventDefault();
                    }
                }}
            >
                <DialogHeader className="shrink-0 border-b px-6 py-4">
                    <DialogTitle className="text-[15px]">
                        {editing ? `${driver?.lastName} ${driver?.firstName}` : 'Новый водитель'}
                    </DialogTitle>
                    <DialogDescription className="text-[12.5px]">
                        {editing
                            ? `${вид?.label}${вид?.detail ? ` · ${вид.detail}` : ''}`
                            : 'Попадёт в общий список: его можно поставить на рейс любого вашего перевозчика'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
                    {!editing && (
                        <div className="flex flex-col gap-2">
                            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Кто это">
                                <KindOption
                                    active={kind === 'STAFF'}
                                    title="Штатный"
                                    text="Работает у вас. Будет и в «Сотрудниках», можно выдать вход в приложение"
                                    onClick={() => setKind('STAFF')}
                                />
                                <KindOption
                                    active={kind === 'OTHER'}
                                    title="Нештатный"
                                    text="Любой другой: от ИП или сам по себе, со своей машиной"
                                    onClick={() => setKind('OTHER')}
                                />
                            </div>
                            {kind === 'OTHER' && (
                                <Field label="От перевозчика" hint="если он от ИП из вашего справочника">
                                    <select
                                        value={carrierId}
                                        onChange={(e) => setCarrierId(e.target.value)}
                                        className="h-9 w-full rounded-xl border border-input bg-background px-3 text-[13px]"
                                    >
                                        <option value="">Без перевозчика — сам по себе</option>
                                        {carriers.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </Field>
                            )}
                        </div>
                    )}

                    <Section title="Водитель">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Фамилия" error={errors.lastName} required>
                                <Input value={values.lastName} onChange={(e) => set('lastName', e.target.value)}
                                    placeholder="Иванов" className="h-9 text-[13px]" aria-invalid={!!errors.lastName} />
                            </Field>
                            <Field label="Имя" error={errors.firstName} required>
                                <Input value={values.firstName} onChange={(e) => set('firstName', e.target.value)}
                                    placeholder="Иван" className="h-9 text-[13px]" aria-invalid={!!errors.firstName} />
                            </Field>
                            <Field label="Отчество">
                                <Input value={values.middleName} onChange={(e) => set('middleName', e.target.value)}
                                    placeholder="Иванович" className="h-9 text-[13px]" />
                            </Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Телефон" error={errors.phone} required>
                                <Input value={values.phone} onChange={(e) => set('phone', e.target.value)}
                                    placeholder="+7 701 123 45 67" inputMode="tel" className="h-9 text-[13px]"
                                    aria-invalid={!!errors.phone} />
                            </Field>
                            <Field label="ИИН">
                                <Input value={values.iin} onChange={(e) => set('iin', e.target.value.replace(/\D/g, '').slice(0, 12))}
                                    placeholder="12 цифр" inputMode="numeric" className="h-9 text-[13px] tabular-nums" />
                            </Field>
                        </div>
                    </Section>

                    <Section title="Машина">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Госномер тягача">
                                <Input value={values.vehiclePlate} onChange={(e) => set('vehiclePlate', e.target.value.toUpperCase())}
                                    placeholder="123 ABC 02" className="h-9 text-[13px]" />
                            </Field>
                            <Field label="Госномер прицепа">
                                <Input value={values.trailerNumber} onChange={(e) => set('trailerNumber', e.target.value.toUpperCase())}
                                    placeholder="12 AB 02" className="h-9 text-[13px]" />
                            </Field>
                            <Field label="Марка и модель">
                                <Input value={values.vehicleModel} onChange={(e) => set('vehicleModel', e.target.value)}
                                    placeholder="Volvo FH" className="h-9 text-[13px]" />
                            </Field>
                            <Field label="Тип кузова">
                                <select
                                    value={values.vehicleType}
                                    onChange={(e) => set('vehicleType', e.target.value)}
                                    className="h-9 w-full rounded-xl border border-input bg-background px-3 text-[13px]"
                                >
                                    <option value="">не указан</option>
                                    {VEHICLE_TYPES.filter((t) => t !== 'не указан').map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    </Section>

                    <Section title="Документ" hint="для доверенности">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Вид">
                                <select
                                    value={values.docType}
                                    onChange={(e) => set('docType', e.target.value)}
                                    className="h-9 w-full rounded-xl border border-input bg-background px-3 text-[13px]"
                                >
                                    <option value="">не указан</option>
                                    <option value="ID_CARD">Удостоверение личности</option>
                                    <option value="PASSPORT">Паспорт</option>
                                </select>
                            </Field>
                            <Field label="Номер">
                                <Input value={values.docNumber} onChange={(e) => set('docNumber', e.target.value)}
                                    placeholder="012345678" className="h-9 text-[13px] tabular-nums" />
                            </Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Выдан">
                                <DateStringField value={values.docIssuedAt} onChange={(v) => set('docIssuedAt', v)}
                                    className="h-9 w-full text-[13px]" />
                            </Field>
                            <Field label="Действует до">
                                <DateStringField value={values.docExpiresAt} onChange={(v) => set('docExpiresAt', v)}
                                    className="h-9 w-full text-[13px]" />
                            </Field>
                            <Field label="Кем выдан">
                                <Input value={values.docIssuedBy} onChange={(e) => set('docIssuedBy', e.target.value)}
                                    placeholder="МВД РК" className="h-9 text-[13px]" />
                            </Field>
                        </div>
                    </Section>

                    {штатный && (
                        <Section title="Приложение водителя">
                            <Field
                                label={editing ? 'Новый пароль' : 'Пароль'}
                                hint={editing ? 'оставьте пустым, чтобы не менять' : 'необязательно — можно выдать позже'}
                            >
                                <Input value={values.password} onChange={(e) => set('password', e.target.value)}
                                    type="password" autoComplete="new-password" className="h-9 text-[13px]" />
                            </Field>
                        </Section>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-6 py-3">
                    {editing && (
                        confirmRemove ? (
                            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                                <span className="text-muted-foreground">Прошлые рейсы останутся, в новых заявках его не будет.</span>
                                <Button variant="outline" size="sm" className="text-destructive" disabled={saving} onClick={remove}>
                                    Убрать
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>Не убирать</Button>
                            </div>
                        ) : (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmRemove(true)}>
                                <UserX className="h-4 w-4" /> Убрать из списка
                            </Button>
                        )
                    )}
                    <div className="ml-auto flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Отмена</Button>
                        <Button size="sm" onClick={save} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {editing ? 'Сохранить' : 'Добавить'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function KindOption({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            onClick={onClick}
            className={cn(
                'flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors',
                active ? 'border-foreground bg-accent' : 'border-border hover:bg-accent/60',
            )}
        >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <span
                    aria-hidden
                    className={cn(
                        // Стиль рамки — явно: preflight у Tailwind выключен, и без
                        // него у span рамка есть по ширине, но не видна.
                        'inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-solid',
                        active ? 'border-[5px] border-foreground' : 'border-muted-foreground/50',
                    )}
                />
                {title}
            </span>
            <span className="text-[12px] leading-snug text-muted-foreground">{text}</span>
        </button>
    );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-semibold text-foreground">
                {title}
                {hint && <span className="ml-1 font-normal text-muted-foreground">· {hint}</span>}
            </h3>
            {children}
        </section>
    );
}

function Field({ label, hint, error, required, children }: {
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-[12px] font-medium text-muted-foreground">
                {label}
                {required && <span className="text-destructive"> *</span>}
                {hint && <span className="ml-1 font-normal opacity-70">· {hint}</span>}
            </Label>
            {children}
            {error && <span className="text-[11.5px] text-destructive">{error}</span>}
        </div>
    );
}
