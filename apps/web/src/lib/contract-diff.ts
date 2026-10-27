/**
 * Чем отличаются две редакции текста договора — по пунктам (G6).
 *
 * Договор хранится статьями с пунктами, и правки стороны обсуждают тоже
 * пунктами: «в 4.2 поменяли срок оплаты». Поэтому сравнение не по строкам
 * текста, а по статье и номеру пункта: что добавили, что убрали, где
 * поменяли формулировку. Реквизиты сторон — отдельной строкой «изменены».
 */
export interface DiffParagraph { number: string; text: string }
export interface DiffArticle { title: string; paragraphs?: DiffParagraph[]; requisites?: unknown }

export type ContractChange =
    | { kind: 'article-added' | 'article-removed'; article: string }
    | { kind: 'added' | 'removed' | 'changed'; article: string; number: string; before?: string; after?: string }
    | { kind: 'requisites'; article: string };

const key = (a: DiffArticle) => (a.title || '').trim();

/**
 * Где именно в пункте разошлись две редакции: общее начало и конец
 * оставляем как есть, а середину подсвечиваем. Обычно правят пару слов в
 * длинном абзаце — без подсветки их приходится искать глазами.
 */
export function splitChange(before: string, after: string) {
    const a = before.split(/(\s+)/);
    const b = after.split(/(\s+)/);
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    return {
        prefix: a.slice(0, start).join(''),
        removed: a.slice(start, endA).join(''),
        added: b.slice(start, endB).join(''),
        suffix: a.slice(endA).join(''),
    };
}

export function diffContract(before: DiffArticle[] | null | undefined, after: DiffArticle[] | null | undefined): ContractChange[] {
    const was = Array.isArray(before) ? before : [];
    const now = Array.isArray(after) ? after : [];
    const changes: ContractChange[] = [];
    const wasByTitle = new Map(was.map((a) => [key(a), a]));
    const nowTitles = new Set(now.map(key));

    for (const a of now) {
        const old = wasByTitle.get(key(a));
        if (!old) { changes.push({ kind: 'article-added', article: a.title }); continue; }
        if (JSON.stringify(old.requisites ?? null) !== JSON.stringify(a.requisites ?? null)) {
            changes.push({ kind: 'requisites', article: a.title });
        }
        const oldByNumber = new Map((old.paragraphs ?? []).map((p) => [p.number, p]));
        const newNumbers = new Set((a.paragraphs ?? []).map((p) => p.number));
        for (const p of a.paragraphs ?? []) {
            const o = oldByNumber.get(p.number);
            if (!o) changes.push({ kind: 'added', article: a.title, number: p.number, after: p.text });
            else if ((o.text ?? '').trim() !== (p.text ?? '').trim()) {
                changes.push({ kind: 'changed', article: a.title, number: p.number, before: o.text, after: p.text });
            }
        }
        for (const o of old.paragraphs ?? []) {
            if (!newNumbers.has(o.number)) changes.push({ kind: 'removed', article: a.title, number: o.number, before: o.text });
        }
    }
    for (const a of was) {
        if (!nowTitles.has(key(a))) changes.push({ kind: 'article-removed', article: a.title });
    }
    return changes;
}
