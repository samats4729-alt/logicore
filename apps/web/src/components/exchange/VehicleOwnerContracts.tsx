'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Download, FilePlus2, Loader2, Pencil, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StatusPill from '@/components/ui/StatusPill';

type OwnerKind = 'PERSON' | 'COMPANY';
type RentBasis = 'TRIP' | 'MONTH';

interface OwnerContract {
    id: string;
    number: string;
    status: 'DRAFT' | 'SIGNED';
    ownerKind: OwnerKind;
    ownerName: string;
    ownerIinBin: string | null;
    ownerIdNumber: string | null;
    ownerIdIssuedBy: string | null;
    ownerIdIssuedAt: string | null;
    ownerAddress: string | null;
    ownerPhone: string | null;
    ownerIban: string | null;
    ownerBank: string | null;
    ownerBankBic: string | null;
    ownerSigner: string | null;
    vehicleModel: string | null;
    vehiclePlate: string;
    vehicleRegNumber: string | null;
    rentAmount: number;
    rentBasis: RentBasis;
    signedFileName: string | null;
    signedAt: string | null;
    createdAt: string;
    gaps: string[];
}

interface ListResponse {
    vehicle: { model: string | null; plate: string | null; regNumber: string | null; isOwn: boolean };
    items: OwnerContract[];
}

type Form = Record<
    'ownerName' | 'ownerIinBin' | 'ownerIdNumber' | 'ownerIdIssuedBy' | 'ownerIdIssuedAt' | 'ownerAddress' | 'ownerPhone'
    | 'ownerIban' | 'ownerBank' | 'ownerBankBic' | 'ownerSigner' | 'vehicleModel' | 'vehiclePlate' | 'vehicleRegNumber' | 'rentAmount',
    string
> & { ownerKind: OwnerKind; rentBasis: RentBasis };

const money = (n: number) => `${n.toLocaleString('ru-RU')} ₸`;

/**
 * Договор парка с владельцем машины (задачи шефа, Q9).
 *
 * Машина водителя записана на другого — парк берёт её в аренду у владельца:
 * вносит данные, скачивает договор, подписывает с владельцем на бумаге и
 * прикладывает скан. Владельца в LogiCore нет, поэтому подписи в
 * приложении здесь не бывает. После скана договор не правится.
 */
export function VehicleOwnerContracts({ driverId }: { driverId: string }) {
    const [data, setData] = useState<ListResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [editing, setEditing] = useState<OwnerContract | 'new' | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const uploadFor = useRef<string | null>(null);

    const load = useCallback(() => {
        api.get(`/exchange/park/drivers/${driverId}/owner-contracts`)
            .then((r) => { setData(r.data); setFailed(false); })
            .catch(() => setFailed(true));
    }, [driverId]);
    useEffect(() => { load(); }, [load]);

    const download = async (c: OwnerContract, signed: boolean) => {
        setBusy(c.id);
        try {
            const res = await api.get(`/exchange/park/owner-contracts/${c.id}/${signed ? 'signed-file' : 'pdf'}`, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = signed ? (c.signedFileName || `Договор ${c.number}`) : `Договор ${c.number}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            // Ответ об ошибке пришёл как файл — достаём текст сервера.
            let message = 'Не удалось скачать договор';
            try { message = JSON.parse(await e?.response?.data?.text?.())?.message || message; } catch { /* остаётся общий текст */ }
            toast.error(message);
        } finally {
            setBusy(null);
        }
    };

    const pickScan = (c: OwnerContract) => {
        uploadFor.current = c.id;
        fileInput.current?.click();
    };

    const upload = async (file: File | undefined) => {
        const id = uploadFor.current;
        if (!file || !id) return;
        setBusy(id);
        try {
            const body = new FormData();
            body.append('file', file);
            await api.post(`/exchange/park/owner-contracts/${id}/signed-file`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success('Подписанный договор приложен — договор подписан');
            load();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось приложить файл'));
        } finally {
            setBusy(null);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    if (failed) return <div className="text-[13px] text-muted-foreground">Не удалось загрузить договоры с владельцами машины — обновите страницу.</div>;
    if (!data) return <div className="h-10 animate-pulse rounded-lg bg-muted" />;

    const needed = !data.vehicle.isOwn;
    return (
        <div className="space-y-3 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="max-w-[70ch] text-muted-foreground">
                    {needed
                        ? 'Машина записана не на водителя. Её парк берёт в аренду у владельца — без водителя, отдельным договором; с водителем — договор на услуги по управлению. Оформите договор, распечатайте, подпишите с владельцем и приложите скан.'
                        : 'Машина записана на водителя — договор с владельцем не нужен. Если водитель ездит на чужом прицепе или машине, оформите договор здесь.'}
                </span>
                <Button variant={needed && !data.items.length ? 'default' : 'outline'} size="sm" onClick={() => setEditing('new')}>
                    <FilePlus2 className="h-4 w-4" /> Оформить договор с владельцем
                </Button>
            </div>

            {data.items.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-solid border-border">
                    <table className="w-full border-collapse text-[13px]">
                        <thead>
                            <tr className="text-left text-[12px] text-muted-foreground">
                                <th className="px-3 py-2 font-medium">Договор</th>
                                <th className="px-3 py-2 font-medium">Владелец</th>
                                <th className="px-3 py-2 font-medium">Машина</th>
                                <th className="px-3 py-2 text-right font-medium">Аренда</th>
                                <th className="px-3 py-2 font-medium">Статус</th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {data.items.map((c) => (
                                <tr key={c.id} className="border-0 border-t border-solid border-border align-top">
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                        <div className="font-medium tabular-nums">№ {c.number}</div>
                                        <div className="text-[12px] text-muted-foreground">от {dayjs(c.createdAt).format('DD.MM.YYYY')}</div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div>{c.ownerName}</div>
                                        <div className="text-[12px] tabular-nums text-muted-foreground">{c.ownerKind === 'PERSON' ? 'ИИН' : 'БИН'} {c.ownerIinBin || '—'}</div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="tabular-nums">{c.vehiclePlate}</div>
                                        <div className="text-[12px] text-muted-foreground">{c.vehicleModel || '—'}</div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                                        {money(c.rentAmount)}
                                        <div className="text-[12px] font-normal text-muted-foreground">{c.rentBasis === 'TRIP' ? 'за рейс' : 'в месяц'}</div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <StatusPill status={c.status === 'SIGNED' ? 'APPROVED' : 'PENDING'} label={c.status === 'SIGNED' ? 'подписан' : 'ждёт подписи'} />
                                        {c.status === 'SIGNED' && c.signedAt && <div className="mt-1 text-[12px] text-muted-foreground">скан от {dayjs(c.signedAt).format('DD.MM.YYYY')}</div>}
                                        {c.gaps.length > 0 && <div className="mt-1 max-w-[36ch] text-[12px] text-destructive">Не хватает: {c.gaps.join(', ')}</div>}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                            {c.status === 'DRAFT' && (
                                                <Button variant="outline" size="sm" onClick={() => setEditing(c)} disabled={busy === c.id}>
                                                    <Pencil className="h-3.5 w-3.5" /> Изменить
                                                </Button>
                                            )}
                                            <Button variant="outline" size="sm" onClick={() => download(c, false)} disabled={busy === c.id || c.gaps.length > 0}>
                                                {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                                {c.status === 'SIGNED' ? 'Текст (PDF)' : 'Для подписи (PDF)'}
                                            </Button>
                                            {c.status === 'SIGNED' ? (
                                                <Button variant="outline" size="sm" onClick={() => download(c, true)} disabled={busy === c.id}>
                                                    <Download className="h-3.5 w-3.5" /> Подписанный скан
                                                </Button>
                                            ) : (
                                                <Button size="sm" onClick={() => pickScan(c)} disabled={busy === c.id || c.gaps.length > 0}>
                                                    <Upload className="h-3.5 w-3.5" /> Приложить подписанный
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                className="hidden"
                aria-label="Скан подписанного договора"
                onChange={(e) => upload(e.target.files?.[0])}
            />

            <OwnerContractDialog
                driverId={driverId}
                editing={editing}
                vehicle={data.vehicle}
                onClose={() => setEditing(null)}
                onSaved={() => { setEditing(null); load(); }}
            />
        </div>
    );
}

function emptyForm(vehicle: ListResponse['vehicle']): Form {
    return {
        ownerKind: 'PERSON', ownerName: '', ownerIinBin: '', ownerIdNumber: '', ownerIdIssuedBy: '', ownerIdIssuedAt: '',
        ownerAddress: '', ownerPhone: '', ownerIban: '', ownerBank: '', ownerBankBic: '', ownerSigner: '',
        vehicleModel: vehicle.model ?? '', vehiclePlate: vehicle.plate ?? '', vehicleRegNumber: vehicle.regNumber ?? '',
        rentAmount: '', rentBasis: 'TRIP',
    };
}

function formOf(c: OwnerContract): Form {
    const s = (v: string | null) => v ?? '';
    return {
        ownerKind: c.ownerKind, ownerName: c.ownerName, ownerIinBin: s(c.ownerIinBin), ownerIdNumber: s(c.ownerIdNumber),
        ownerIdIssuedBy: s(c.ownerIdIssuedBy), ownerIdIssuedAt: c.ownerIdIssuedAt ? c.ownerIdIssuedAt.slice(0, 10) : '',
        ownerAddress: s(c.ownerAddress), ownerPhone: s(c.ownerPhone), ownerIban: s(c.ownerIban), ownerBank: s(c.ownerBank),
        ownerBankBic: s(c.ownerBankBic), ownerSigner: s(c.ownerSigner), vehicleModel: s(c.vehicleModel), vehiclePlate: c.vehiclePlate,
        vehicleRegNumber: s(c.vehicleRegNumber), rentAmount: String(c.rentAmount), rentBasis: c.rentBasis,
    };
}

/** Два-три варианта, которые не растут, — кнопками, а не выпадающим списком. */
function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
    return (
        <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-solid border-border p-0.5">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'h-7 cursor-pointer rounded-full border-0 px-3 text-[12.5px] [font-family:inherit]',
                        value === o.value ? 'bg-foreground text-background' : 'bg-transparent text-foreground hover:bg-accent',
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('space-y-1', className)}>
            <Label className="text-[12px] text-muted-foreground">{label}</Label>
            {children}
            {hint && <div className="text-[11.5px] text-muted-foreground">{hint}</div>}
        </div>
    );
}

function OwnerContractDialog({ driverId, editing, vehicle, onClose, onSaved }: {
    driverId: string;
    editing: OwnerContract | 'new' | null;
    vehicle: ListResponse['vehicle'];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState<Form>(() => emptyForm(vehicle));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!editing) return;
        setForm(editing === 'new' ? emptyForm(vehicle) : formOf(editing));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing]);

    const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
    const person = form.ownerKind === 'PERSON';

    const save = async () => {
        const opt = (v: string) => (v.trim() ? v.trim() : null);
        const amount = Number(form.rentAmount.replace(/\s/g, '').replace(',', '.'));
        if (!form.ownerName.trim()) { toast.error(person ? 'Укажите ФИО владельца' : 'Укажите название организации-владельца'); return; }
        if (!form.vehiclePlate.trim()) { toast.error('Укажите госномер машины'); return; }
        if (!(amount > 0)) { toast.error('Укажите арендную плату'); return; }
        const body = {
            ownerKind: form.ownerKind,
            ownerName: form.ownerName.trim(),
            ownerIinBin: opt(form.ownerIinBin.replace(/\s/g, '')),
            ownerIdNumber: person ? opt(form.ownerIdNumber) : null,
            ownerIdIssuedBy: person ? opt(form.ownerIdIssuedBy) : null,
            ownerIdIssuedAt: person ? opt(form.ownerIdIssuedAt) : null,
            ownerAddress: opt(form.ownerAddress),
            ownerPhone: opt(form.ownerPhone),
            ownerIban: opt(form.ownerIban.replace(/\s/g, '').toUpperCase()),
            ownerBank: opt(form.ownerBank),
            ownerBankBic: person ? null : opt(form.ownerBankBic),
            ownerSigner: person ? null : opt(form.ownerSigner),
            vehicleModel: opt(form.vehicleModel),
            vehiclePlate: form.vehiclePlate.trim(),
            vehicleRegNumber: opt(form.vehicleRegNumber),
            rentAmount: amount,
            rentBasis: form.rentBasis,
        };
        setSaving(true);
        try {
            const res = editing === 'new' || !editing
                ? await api.post(`/exchange/park/drivers/${driverId}/owner-contracts`, body)
                : await api.put(`/exchange/park/owner-contracts/${editing.id}`, body);
            const gaps: string[] = res.data?.gaps ?? [];
            if (gaps.length) toast.warning(`Договор сохранён. Чтобы распечатать, не хватает: ${gaps.join(', ')}`);
            else toast.success('Договор готов — скачайте его для подписи');
            onSaved();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить договор'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={!!editing} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">
                        {editing && editing !== 'new' ? `Договор № ${editing.number}` : 'Договор аренды машины с её владельцем'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 text-[13px]">
                    <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Владелец машины</div>
                            <Choice
                                label="Кто владелец"
                                value={form.ownerKind}
                                onChange={(v) => setForm((f) => ({ ...f, ownerKind: v }))}
                                options={[{ value: 'PERSON', label: 'Человек' }, { value: 'COMPANY', label: 'ТОО или ИП' }]}
                            />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label={person ? 'ФИО' : 'Название'} className="sm:col-span-2">
                                <Input className="h-8" value={form.ownerName} onChange={set('ownerName')} placeholder={person ? 'Ахметов Ахмет Ахметович' : 'ТОО «Название»'} />
                            </Field>
                            <Field label={person ? 'ИИН' : 'БИН или ИИН'}>
                                <Input className="h-8 tabular-nums" inputMode="numeric" maxLength={14} value={form.ownerIinBin} onChange={set('ownerIinBin')} placeholder="12 цифр" />
                            </Field>
                            <Field label="Телефон">
                                <Input className="h-8" value={form.ownerPhone} onChange={set('ownerPhone')} placeholder="+7 701 000 00 00" />
                            </Field>
                            {person && (
                                <>
                                    <Field label="Удостоверение личности, №">
                                        <Input className="h-8" value={form.ownerIdNumber} onChange={set('ownerIdNumber')} />
                                    </Field>
                                    <Field label="Кем выдано">
                                        <Input className="h-8" value={form.ownerIdIssuedBy} onChange={set('ownerIdIssuedBy')} placeholder="МВД РК" />
                                    </Field>
                                    <Field label="Когда выдано">
                                        <Input className="h-8" type="date" value={form.ownerIdIssuedAt} onChange={set('ownerIdIssuedAt')} />
                                    </Field>
                                </>
                            )}
                            {!person && (
                                <Field label="Кто подписывает" hint="Например: директор Петров П. П.">
                                    <Input className="h-8" value={form.ownerSigner} onChange={set('ownerSigner')} />
                                </Field>
                            )}
                            <Field label={person ? 'Адрес прописки' : 'Юридический адрес'} className="sm:col-span-2">
                                <Input className="h-8" value={form.ownerAddress} onChange={set('ownerAddress')} />
                            </Field>
                            <Field label="Счёт (IBAN)" hint="На него парк платит аренду">
                                <Input className="h-8 tabular-nums" value={form.ownerIban} onChange={set('ownerIban')} placeholder="KZ…" />
                            </Field>
                            <Field label="Банк">
                                <Input className="h-8" value={form.ownerBank} onChange={set('ownerBank')} />
                            </Field>
                            {!person && (
                                <Field label="БИК банка">
                                    <Input className="h-8" value={form.ownerBankBic} onChange={set('ownerBankBic')} />
                                </Field>
                            )}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Машина</div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Марка и модель">
                                <Input className="h-8" value={form.vehicleModel} onChange={set('vehicleModel')} />
                            </Field>
                            <Field label="Госномер">
                                <Input className="h-8 tabular-nums" value={form.vehiclePlate} onChange={set('vehiclePlate')} />
                            </Field>
                            <Field label="Техпаспорт, №">
                                <Input className="h-8" value={form.vehicleRegNumber} onChange={set('vehicleRegNumber')} />
                            </Field>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Арендная плата</div>
                        <div className="flex flex-wrap items-end gap-3">
                            <Field label="Сумма, ₸">
                                <Input className="h-8 w-40 tabular-nums" inputMode="decimal" value={form.rentAmount} onChange={set('rentAmount')} placeholder="50 000" />
                            </Field>
                            <Choice
                                label="За что платим"
                                value={form.rentBasis}
                                onChange={(v) => setForm((f) => ({ ...f, rentBasis: v }))}
                                options={[{ value: 'TRIP', label: 'за рейс' }, { value: 'MONTH', label: 'в месяц' }]}
                            />
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                            Топливо и расходы по рейсам в аренду не входят — их несёт парк. Если владелец — человек без ИП, налог с аренды парк удерживает сам.
                        </div>
                    </section>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
                    <Button onClick={save} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Сохранить
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
