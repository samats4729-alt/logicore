'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

export interface EmployeeLogin {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
}

/**
 * Почта и пароль сотрудника — руками руководителя.
 *
 * Сотрудник забыл пароль, а письмо для восстановления до него не доходит:
 * почту вписали с ошибкой или ящика больше нет. Раньше выход был один —
 * удалить и пригласить заново. Теперь руководитель ставит верную почту и
 * новый пароль здесь и сообщает их сотруднику.
 */
export default function EmployeeLoginDialog({
    employee,
    onClose,
    onSaved,
}: {
    /** Чей вход правим; нет — окно закрыто. */
    employee: EmployeeLogin | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!employee) return;
        setEmail(employee.email || '');
        setPassword('');
        setError('');
    }, [employee]);

    const name = [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'Сотрудник';

    const save = async () => {
        if (!employee) return;
        const почта = email.trim();
        const payload: { email?: string; password?: string } = {};
        if (почта.toLowerCase() !== (employee.email || '').trim().toLowerCase()) payload.email = почта;
        if (password) payload.password = password;
        if (!payload.email && !payload.password) {
            setError('Ничего не изменилось: поменяйте почту или впишите новый пароль.');
            return;
        }
        if (payload.password && payload.password.length < 8) {
            setError('Пароль — не короче 8 символов.');
            return;
        }
        setSaving(true);
        try {
            await api.put(`/company/users/${employee.id}`, payload);
            toast.success(payload.password
                ? 'Сохранено. Сообщите сотруднику новый пароль — прежние входы с его устройств закрыты'
                : 'Почта для входа изменена');
            onSaved();
            onClose();
        } catch (e: any) {
            setError(e.response?.data?.message || 'Не удалось сохранить — попробуйте ещё раз.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={!!employee} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-md" data-testid="employee-login-dialog">
                <DialogHeader>
                    <DialogTitle>Вход сотрудника</DialogTitle>
                    <DialogDescription>
                        {name}. Смените почту, по которой он входит, или задайте новый пароль —
                        если свой он забыл, а письмо для восстановления до него не доходит.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="grid gap-1.5">
                        <Label htmlFor="employee-login-email">Почта для входа</Label>
                        <Input
                            id="employee-login-email"
                            type="email"
                            autoComplete="off"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(''); }}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="employee-login-password">Новый пароль</Label>
                        {/* Виден открыто: руководитель его диктует сотруднику. */}
                        <Input
                            id="employee-login-password"
                            type="text"
                            autoComplete="off"
                            placeholder="Оставьте пустым, чтобы не менять"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                        />
                        <p className="text-[12px] text-muted-foreground">
                            Не короче 8 символов. Сменить его на свой сотрудник сможет в профиле.
                        </p>
                    </div>
                    {error && (
                        <p role="alert" className="text-[12.5px] text-destructive">{error}</p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={onClose}>Отмена</Button>
                    <Button size="sm" onClick={save} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        Сохранить
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
