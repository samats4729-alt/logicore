'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MoreHorizontal, Search, Trash2, X } from 'lucide-react';
import { DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { initials } from './ui';
import s from './new-order.module.css';

export interface HeaderOrg { id: string; name: string; bin?: string | null }
export interface HeaderUser { id: string; title: string; subtitle?: string }

/** Выпадающее меню под кнопкой шапки: закрывается кликом мимо и Esc. */
function useMenu() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey, true);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
    }, [open]);
    return { open, setOpen, ref };
}

/**
 * Шапка окна заявки (ТЗ, §3): название, состояние черновика, от какой
 * организации, менеджер, «⋯ → Начать заново», закрыть. Организация видна,
 * только если их у человека больше одной.
 */
export function Header({
    title,
    savedText,
    savedDot,
    scrolled,
    orgs,
    orgId,
    onOrg,
    managerValue,
    managerPinned,
    managerUsers,
    onManager,
    onReset,
}: {
    title: string;
    savedText?: string;
    savedDot?: boolean;
    scrolled: boolean;
    orgs: HeaderOrg[];
    orgId: string;
    onOrg: (id: string) => void;
    managerValue: string;
    managerPinned: HeaderUser[];
    managerUsers: HeaderUser[];
    onManager: (id: string) => void;
    /** «Начать заново» — только у новой заявки. */
    onReset?: () => void;
}) {
    const org = useMenu();
    const mgr = useMenu();
    const more = useMenu();
    const [q, setQ] = useState('');
    const [confirmReset, setConfirmReset] = useState(false);
    const current = orgs.find((o) => o.id === orgId);
    const all = [...managerPinned, ...managerUsers];
    const manager = all.find((u) => u.id === managerValue);
    const managerShort = manager
        ? manager.id === 'NONE' ? 'не назначен' : manager.title.split(' ').slice(0, 2).map((w, i) => (i === 1 ? `${w[0]}.` : w)).join(' ')
        : '—';
    const filtered = useMemo(() => {
        const n = q.trim().toLowerCase();
        return n ? managerUsers.filter((u) => u.title.toLowerCase().includes(n)) : managerUsers;
    }, [q, managerUsers]);

    return (
        <header className={cn(s.header, scrolled && s.headerScrolled)}>
            <DialogTitle className={s.title}>{title}</DialogTitle>
            <DialogDescription className={s.saved} data-testid={savedDot ? 'order-draft-saved' : undefined}>
                {savedDot && <span className={s.savedDot} aria-hidden />}
                {savedText}
            </DialogDescription>
            <span className={s.spacer} />

            {orgs.length > 1 && (
                <div className={s.anchor} ref={org.ref}>
                    <button type="button" className={s.chipBtn} aria-haspopup="menu" aria-expanded={org.open} onClick={() => org.setOpen((o) => !o)} aria-label="Организация">
                        <span className={s.chipLabel}>От</span>
                        <span className={cn(s.avatarSq, s.avatarStrong, s.avatarSm)}>{initials(current?.name)}</span>
                        <span className={s.chipValue} style={{ maxWidth: 190 }}>{current?.name ?? 'Организация'}</span>
                        <ChevronDown className={cn('size-3.5', s.boxIcon)} aria-hidden />
                    </button>
                    {org.open && (
                        <div className={cn(s.drop, s.dropMenu)} role="menu">
                            <div className={s.micro}>Заявка от организации</div>
                            {orgs.map((o) => (
                                <button
                                    key={o.id}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={o.id === orgId}
                                    className={cn(s.opt, o.id === orgId && s.optActive)}
                                    onClick={() => { onOrg(o.id); org.setOpen(false); }}
                                >
                                    <span className={cn(s.avatarSq, s.avatarStrong)}>{initials(o.name)}</span>
                                    <span className={s.optMain}>
                                        <span className={s.optTitle}>{o.name}</span>
                                        {o.bin && <span className={s.optSub}>БИН {o.bin}</span>}
                                    </span>
                                    {o.id === orgId && <Check className={cn('size-4', s.check)} strokeWidth={2.5} aria-hidden />}
                                </button>
                            ))}
                            <p className={s.menuFoot}>От её имени оформляются документы по заявке</p>
                        </div>
                    )}
                </div>
            )}

            <div className={s.anchor} ref={mgr.ref}>
                <button
                    type="button"
                    className={s.chipBtn}
                    aria-haspopup="menu"
                    aria-expanded={mgr.open}
                    aria-label="Ответственный менеджер"
                    onClick={() => { setQ(''); mgr.setOpen((o) => !o); }}
                >
                    <span className={s.chipLabel}>Менеджер</span>
                    {manager && manager.id !== 'NONE' && <span className={cn(s.avatarRound, s.avatarSm)}>{initials(manager.title)}</span>}
                    <span className={s.chipValue}>{managerShort}</span>
                    <ChevronDown className={cn('size-3.5', s.boxIcon)} aria-hidden />
                </button>
                {mgr.open && (
                    <div className={cn(s.drop, s.dropMenu)} role="menu" style={{ maxHeight: 420 }}>
                        {managerUsers.length > 6 && (
                            <div className={s.box} style={{ height: 36, marginBottom: 6 }}>
                                <Search className={cn('size-4', s.boxIcon)} aria-hidden />
                                <input className={s.bareInput} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фамилия или имя" aria-label="Найти менеджера" />
                            </div>
                        )}
                        {managerPinned.map((u) => (
                            <MenuPerson key={u.id} user={u} on={u.id === managerValue} onPick={() => { onManager(u.id); mgr.setOpen(false); }} />
                        ))}
                        {filtered.length > 0 && <div className={s.micro}>Сотрудники</div>}
                        {filtered.map((u) => (
                            <MenuPerson key={u.id} user={u} on={u.id === managerValue} onPick={() => { onManager(u.id); mgr.setOpen(false); }} />
                        ))}
                        <p className={s.menuFoot}>Заявка закрепится за менеджером; вы останетесь её создателем</p>
                    </div>
                )}
            </div>

            {onReset && (
                <div className={s.anchor} ref={more.ref}>
                    <button type="button" className={s.iconBtn} aria-label="Действия с черновиком" aria-expanded={more.open} onClick={() => { setConfirmReset(false); more.setOpen((o) => !o); }}>
                        <MoreHorizontal className="size-[18px]" />
                    </button>
                    {more.open && (
                        <div className={cn(s.drop, s.dropMenu)} role="menu" style={{ width: 260 }}>
                            {!confirmReset ? (
                                <button type="button" role="menuitem" className={cn(s.opt, s.danger)} onClick={() => setConfirmReset(true)}>
                                    <Trash2 className="size-3.5" aria-hidden /> Начать заново
                                </button>
                            ) : (
                                <div className="flex flex-col gap-2 p-2">
                                    <span className={s.hint}>Всё, что введено в заявку, пропадёт.</span>
                                    <button type="button" className={cn(s.btn, s.danger)} style={{ height: 34 }} onClick={() => { more.setOpen(false); setConfirmReset(false); onReset(); }}>
                                        Стереть и начать заново
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <DialogClose asChild>
                <button type="button" className={s.iconBtn} aria-label="Закрыть">
                    <X className="size-[18px]" />
                </button>
            </DialogClose>
        </header>
    );
}

function MenuPerson({ user, on, onPick }: { user: HeaderUser; on: boolean; onPick: () => void }) {
    return (
        <button type="button" role="menuitemradio" aria-checked={on} className={cn(s.opt, on && s.optActive)} onClick={onPick}>
            {user.id === 'NONE'
                ? <span className={s.avatarRound}>—</span>
                : <span className={s.avatarRound}>{initials(user.title)}</span>}
            <span className={s.optMain}>
                <span className={s.optTitle}>{user.title}</span>
                {user.subtitle && <span className={s.optSub}>{user.subtitle}</span>}
            </span>
            {on && <Check className={cn('size-4', s.check)} strokeWidth={2.5} aria-hidden />}
        </button>
    );
}
