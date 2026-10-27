'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера, телефонКрасиво } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Added {
    id: string;
    lastName: string;
    firstName: string;
    phone: string;
    password: string;
}

/**
 * Парк сам добавляет водителя (задачи шефа, Q3/R1).
 *
 * Диспетчер вносит имя и номер — система придумывает пароль и показывает
 * его один раз, чтобы продиктовать водителю. Дальше водитель входит в
 * приложение по номеру и паролю и заполняет анкету, а она приходит парку
 * на проверку — как у тех, кто пришёл по коду приглашения.
 */
export default function AddParkDriverDialog({ open, onOpenChange, onAdded }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded: () => void;
}) {
    const [lastName, setLastName] = useState('');
    const [firstName, setFirstName] = useState('');
    const [phone, setPhone] = useState('');
    const [saving, setSaving] = useState(false);
    const [added, setAdded] = useState<Added | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLastName('');
        setFirstName('');
        setPhone('');
        setAdded(null);
        setCopied(false);
    }, [open]);

    const submit = async () => {
        if (!lastName.trim() || !firstName.trim() || !phone.trim()) {
            toast.warning('Укажите фамилию, имя и телефон водителя');
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.post<Added>('/exchange/park/drivers', {
                lastName: lastName.trim(), firstName: firstName.trim(), phone: phone.trim(),
            });
            setAdded(data);
            onAdded();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось добавить водителя'));
        } finally {
            setSaving(false);
        }
    };

    const message = added
        ? `LogiCore: скачайте приложение LogiCore и войдите по номеру ${телефонКрасиво(added.phone)}, пароль ${added.password}. `
            + 'Заполните анкету — парк проверит её и допустит к грузам.'
        : '';

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(message);
            setCopied(true);
        } catch {
            toast.error('Не удалось скопировать — выделите текст вручную');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">{added ? 'Водитель добавлен' : 'Добавить водителя'}</DialogTitle>
                </DialogHeader>
                {added ? (
                    <div className="space-y-3 text-[13px]">
                        <p className="m-0">
                            Передайте водителю номер и пароль — он войдёт в приложение и заполнит анкету: удостоверение,
                            машину, договор. Анкета придёт вам на проверку.
                        </p>
                        <div className="space-y-1 rounded-xl border border-solid border-border p-3">
                            <div className="text-muted-foreground">{added.lastName} {added.firstName}</div>
                            <div>Номер: <b className="tabular-nums">{телефонКрасиво(added.phone)}</b></div>
                            <div>Пароль: <b className="text-[16px] tracking-wider tabular-nums">{added.password}</b></div>
                        </div>
                        <p className="m-0 text-[12px] text-muted-foreground">
                            Пароль показывается один раз — потом его не увидит никто, даже вы. Отправьте его водителю
                            сразу.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={copy}>
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copied ? 'Скопировано' : 'Скопировать сообщение для водителя'}
                            </Button>
                            <Button onClick={() => onOpenChange(false)}>Готово</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 text-[13px]">
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Фамилия</span>
                            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} className="h-9 text-[13px]" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Имя</span>
                            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={100} className="h-9 text-[13px]" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Телефон</span>
                            <Input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="+7 701 123 45 67"
                                inputMode="tel"
                                maxLength={30}
                                className="h-9 text-[13px]"
                            />
                        </label>
                        <p className="m-0 text-[12px] text-muted-foreground">
                            Пароль система придумает сама и покажет после добавления. По номеру и паролю водитель войдёт в
                            приложение.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
                            <Button onClick={submit} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                                Добавить
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
