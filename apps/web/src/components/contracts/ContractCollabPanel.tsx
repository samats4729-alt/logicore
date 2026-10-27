'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, History, Loader2, MessageSquareDiff, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { diffContract, splitChange, type ContractChange, type DiffArticle } from '@/lib/contract-diff';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/auth';

export interface CollabState {
    version: number;
    mySide: 'FORWARDER' | 'CUSTOMER';
    otherSide: { id: string; name: string; onPlatform: boolean } | null;
    directEditAllowed: boolean;
    proposals: {
        id: string; baseVersion: number; summary: string | null; status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'OUTDATED';
        createdAt: string; proposedByName: string | null; decidedByName: string | null; decidedAt: string | null; decisionNote: string | null; mine: boolean;
    }[];
    revisions: { version: number; source: string; authorName: string | null; note: string | null; createdAt: string }[];
}

const STATUS: Record<CollabState['proposals'][number]['status'], string> = {
    PENDING: 'ждёт решения', ACCEPTED: 'принято', REJECTED: 'отклонено', WITHDRAWN: 'отозвано', OUTDATED: 'устарело',
};
const SOURCE: Record<string, string> = {
    INITIAL: 'исходный текст', SAVE: 'сохранено', PROPOSAL: 'принятые правки', RESET: 'сброс к шаблону',
};
const when = (d: string | null) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '');

/**
 * Согласование текста договора со второй стороной (G6, владелец 25.10.2026):
 * предложения правок — принять, отклонить с причиной, отозвать; история
 * версий с автором и временем; разница по пунктам. Решение о правках —
 * на сервере (`ContractCollabService`), здесь только показ и кнопки.
 */
export default function ContractCollabPanel({ contractId, reloadKey, onTextChanged, onLoaded }: {
    contractId: string;
    /** Меняется — блок перечитывает состояние (после сохранения или предложения). */
    reloadKey: number;
    /** Принятые правки поменяли текст — редактору нужно перечитать статьи. */
    onTextChanged: () => void;
    /** Редактору нужно знать, сохранять ли текст напрямую или предлагать. */
    onLoaded?: (state: CollabState) => void;
}) {
    const [state, setState] = useState<CollabState | null>(null);
    const [failed, setFailed] = useState(false);
    const [openProposal, setOpenProposal] = useState<string | null>(null);
    const [openVersion, setOpenVersion] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const load = useCallback(() => {
        api.get(`/contracts/${contractId}/collab`).then((r) => { setState(r.data); setFailed(false); onLoaded?.(r.data); }).catch(() => setFailed(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contractId]);
    useEffect(() => { load(); }, [load, reloadKey]);

    if (failed) return <div className="mb-3 rounded-xl border border-solid border-border p-3 text-[12px] text-muted-foreground">Не удалось загрузить согласование текста — обновите страницу.</div>;
    if (!state) return null;

    const pending = state.proposals.filter((p) => p.status === 'PENDING');
    const other = state.otherSide;
    return (
        <section aria-label="Согласование текста" className="mb-3 rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="text-[15px] font-semibold">Согласование текста</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {state.version ? `Версия ${state.version}` : 'Текст ещё не меняли'}
                        {other && ` · вторая сторона — ${other.name}${other.onPlatform ? ', работает в LogiCore' : ', в LogiCore не работает'}`}
                    </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowHistory((v) => !v)}>
                    <History className="h-3.5 w-3.5" /> {showHistory ? 'Скрыть историю' : `История версий (${state.revisions.length})`}
                </Button>
            </div>

            {!state.directEditAllowed && (
                <div className="mt-2 text-[12px] leading-snug text-muted-foreground">
                    Договор уже не черновик, и вторая сторона работает в LogiCore — поэтому текст меняется только по согласию обеих сторон:
                    ваши правки уходят предложением, а правки второй стороны вы принимаете или отклоняете здесь.
                </div>
            )}

            {pending.length > 0 && (
                <ul className="m-0 mt-3 list-none space-y-2 p-0">
                    {pending.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-border px-3 py-2">
                            <div className="min-w-0">
                                <div className="text-[13px] font-medium">
                                    {p.mine ? `Ваши правки ждут решения: ${other?.name ?? 'вторая сторона'}` : `Правки от ${p.proposedByName ?? other?.name ?? 'второй стороны'}`}
                                </div>
                                <div className="truncate text-[12px] text-muted-foreground">{when(p.createdAt)}{p.summary ? ` · ${p.summary}` : ''}</div>
                            </div>
                            <Button type="button" size="sm" variant={p.mine ? 'outline' : 'default'} onClick={() => setOpenProposal(p.id)}>
                                <MessageSquareDiff className="h-3.5 w-3.5" /> {p.mine ? 'Посмотреть' : 'Посмотреть и решить'}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            {showHistory && (
                <div className="mt-3">
                    {state.revisions.length > 1 && <div className="mb-1 text-[12px] text-muted-foreground">Нажмите на версию — покажем, что в ней изменилось по сравнению с предыдущей.</div>}
                    <div className="max-h-72 overflow-auto rounded-xl border border-solid border-border">
                    {state.revisions.length === 0 ? (
                        <div className="p-3 text-[12px] text-muted-foreground">Пока ни одной правки — история начнётся с первого сохранения.</div>
                    ) : (
                        <table className="w-full border-collapse text-[12.5px]">
                            <tbody>
                                {state.revisions.map((r) => (
                                    <tr key={r.version} className={cn('border-0 border-b border-solid border-border last:border-b-0', r.version > 1 && 'cursor-pointer hover:bg-muted/50')} onClick={() => r.version > 1 && setOpenVersion(r.version)}>
                                        <td className="w-14 whitespace-nowrap px-3 py-2 font-medium tabular-nums">№ {r.version}</td>
                                        <td className="w-36 whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{when(r.createdAt)}</td>
                                        <td className="w-40 whitespace-nowrap px-3 py-2">{SOURCE[r.source] ?? r.source}</td>
                                        <td className="px-3 py-2 text-muted-foreground">{r.authorName ?? '—'}{r.note ? ` · ${r.note}` : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    </div>
                </div>
            )}

            {state.proposals.some((p) => p.status !== 'PENDING') && showHistory && (
                <div className="mt-3">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Предложения</div>
                    <ul className="m-0 list-none space-y-1 p-0 text-[12.5px]">
                        {state.proposals.filter((p) => p.status !== 'PENDING').map((p) => (
                            <li key={p.id} className="cursor-pointer rounded-lg px-2 py-1 hover:bg-muted/50" onClick={() => setOpenProposal(p.id)}>
                                <span className="tabular-nums text-muted-foreground">{when(p.createdAt)}</span> · {p.mine ? 'ваши правки' : `от ${p.proposedByName ?? 'второй стороны'}`} — {STATUS[p.status]}
                                {p.decisionNote ? <span className="text-muted-foreground"> · {p.decisionNote}</span> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <ProposalDialog
                contractId={contractId}
                proposalId={openProposal}
                onClose={() => setOpenProposal(null)}
                onDecided={(textChanged) => { setOpenProposal(null); load(); if (textChanged) onTextChanged(); }}
            />
            <VersionDialog contractId={contractId} version={openVersion} onClose={() => setOpenVersion(null)} />
        </section>
    );
}

/** Изменения по пунктам — одним списком: было → стало. */
function ChangesList({ changes }: { changes: ContractChange[] }) {
    if (!changes.length) return <div className="py-4 text-center text-[13px] text-muted-foreground">Текст не отличается.</div>;
    return (
        <ul className="m-0 list-none space-y-2 p-0">
            {changes.map((c, i) => (
                <li key={i} className="rounded-xl border border-solid border-border px-3 py-2 text-[13px]">
                    {c.kind === 'article-added' && <><b className="font-medium">Добавлена статья</b> «{c.article}»</>}
                    {c.kind === 'article-removed' && <><b className="font-medium">Убрана статья</b> «{c.article}»</>}
                    {c.kind === 'requisites' && <><b className="font-medium">Изменены реквизиты</b> в «{c.article}»</>}
                    {(c.kind === 'added' || c.kind === 'removed' || c.kind === 'changed') && (
                        <>
                            <div className="mb-1 text-[12px] text-muted-foreground">
                                {c.article} · пункт {c.number} — {c.kind === 'added' ? 'добавлен' : c.kind === 'removed' ? 'убран' : 'изменён'}
                            </div>
                            {c.kind === 'changed' && c.before != null && c.after != null ? (
                                <ChangedText before={c.before} after={c.after} />
                            ) : (
                                <>
                                    {c.before != null && <Version label="Было" tone="old">{c.before}</Version>}
                                    {c.after != null && <Version label="Стало" tone="new">{c.after}</Version>}
                                </>
                            )}
                        </>
                    )}
                </li>
            ))}
        </ul>
    );
}

function Version({ label, tone, children }: { label: string; tone: 'old' | 'new'; children: React.ReactNode }) {
    return (
        <div className={cn('mt-1 whitespace-pre-wrap rounded-md px-2 py-1', tone === 'old' ? 'bg-destructive/5' : 'bg-emerald-500/5')}>
            <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
            {children}
        </div>
    );
}

/** Пункт изменён: тот же абзац дважды, а изменённые слова подсвечены. */
function ChangedText({ before, after }: { before: string; after: string }) {
    const { prefix, removed, added, suffix } = splitChange(before, after);
    return (
        <>
            <Version label="Было" tone="old">
                {prefix}{removed && <mark className="rounded-sm bg-destructive/20 px-0.5 text-foreground line-through decoration-destructive/60">{removed}</mark>}{suffix}
            </Version>
            <Version label="Стало" tone="new">
                {prefix}{added && <mark className="rounded-sm bg-emerald-500/25 px-0.5 text-foreground">{added}</mark>}{suffix}
            </Version>
        </>
    );
}

function ProposalDialog({ contractId, proposalId, onClose, onDecided }: {
    contractId: string; proposalId: string | null; onClose: () => void; onDecided: (textChanged: boolean) => void;
}) {
    const role = useAuthStore((s) => s.user?.role);
    // Принять или отклонить — решение руководителя (как и на сервере);
    // логист видит правки, но решает не он.
    const canDecide = role === 'COMPANY_ADMIN' || role === 'FORWARDER';
    const [data, setData] = useState<any>(null);
    const [reason, setReason] = useState('');
    const [rejecting, setRejecting] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!proposalId) return;
        setData(null); setReason(''); setRejecting(false);
        api.get(`/contracts/${contractId}/proposals/${proposalId}`).then((r) => setData(r.data)).catch((e) => {
            toast.error(e?.response?.data?.message || 'Не удалось открыть предложение');
            onClose();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contractId, proposalId]);

    const act = async (kind: 'accept' | 'reject' | 'withdraw') => {
        if (kind === 'reject' && !reason.trim()) { toast.error('Напишите, почему отклоняете: вторая сторона поймёт, что поправить'); return; }
        setBusy(true);
        try {
            await api.post(`/contracts/${contractId}/proposals/${proposalId}/${kind}`, kind === 'reject' ? { reason } : {});
            toast.success(kind === 'accept' ? 'Правки приняты — это новая версия текста' : kind === 'reject' ? 'Правки отклонены, вторая сторона увидит причину' : 'Предложение отозвано');
            onDecided(kind === 'accept');
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не получилось');
            if (e?.response?.status === 409) onDecided(false);
        } finally {
            setBusy(false);
        }
    };

    const changes = data ? diffContract(data.baseContent as DiffArticle[], data.content as DiffArticle[]) : [];
    const pending = data?.status === 'PENDING';
    return (
        <Dialog open={!!proposalId} onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">
                        {data?.mine ? 'Ваши правки' : `Правки от ${data?.proposedByName ?? 'второй стороны'}`}
                        {data && !pending ? ` — ${STATUS[data.status as keyof typeof STATUS]}` : ''}
                    </DialogTitle>
                </DialogHeader>
                {!data ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                    <>
                        {data.summary && <div className="text-[13px]">{data.summary}</div>}
                        {data.decisionNote && <div className="text-[13px] text-muted-foreground">Ответ второй стороны: {data.decisionNote}</div>}
                        <div className="max-h-[50vh] overflow-auto"><ChangesList changes={changes} /></div>
                        {pending && !data.mine && !canDecide && (
                            <div className="text-[12px] text-muted-foreground">Принять или отклонить правки может руководитель или экспедитор вашей компании.</div>
                        )}
                        {pending && !data.mine && canDecide && (
                            <div className="space-y-2">
                                {rejecting && (
                                    <textarea
                                        aria-label="Причина отказа"
                                        autoFocus
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        rows={3}
                                        placeholder="Почему отклоняете — например: оставьте прежний срок оплаты, 15 дней"
                                        className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                                    />
                                )}
                                <div className="flex flex-wrap justify-end gap-2">
                                    {rejecting ? (
                                        <>
                                            <Button type="button" variant="outline" size="sm" onClick={() => setRejecting(false)} disabled={busy}>Назад</Button>
                                            <Button type="button" variant="destructive" size="sm" onClick={() => act('reject')} disabled={busy}><X className="h-3.5 w-3.5" /> Отклонить</Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button type="button" variant="outline" size="sm" onClick={() => setRejecting(true)} disabled={busy}><X className="h-3.5 w-3.5" /> Отклонить…</Button>
                                            <Button type="button" size="sm" onClick={() => act('accept')} disabled={busy}>
                                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Принять правки
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                        {pending && data.mine && (
                            <div className="flex justify-end">
                                <Button type="button" variant="outline" size="sm" onClick={() => act('withdraw')} disabled={busy}><Undo2 className="h-3.5 w-3.5" /> Отозвать</Button>
                            </div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function VersionDialog({ contractId, version, onClose }: { contractId: string; version: number | null; onClose: () => void }) {
    const [data, setData] = useState<any>(null);
    useEffect(() => {
        if (!version) return;
        setData(null);
        api.get(`/contracts/${contractId}/revisions/${version}`).then((r) => setData(r.data)).catch(() => { toast.error('Не удалось открыть версию'); onClose(); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contractId, version]);
    return (
        <Dialog open={!!version} onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">Версия № {version} — что изменилось по сравнению с № {(version ?? 1) - 1}</DialogTitle>
                </DialogHeader>
                {!data ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                    <>
                        <div className="text-[12px] text-muted-foreground">{when(data.createdAt)} · {data.authorName ?? '—'}{data.note ? ` · ${data.note}` : ''}</div>
                        <div className="max-h-[55vh] overflow-auto"><ChangesList changes={diffContract(data.previousContent as DiffArticle[], data.content as DiffArticle[])} /></div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
