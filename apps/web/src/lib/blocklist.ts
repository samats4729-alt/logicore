/** Чёрный список компании (задачи шефа, F5/S2) — то, что знает о нём экран. */

export type BlockKind = 'BIN_IIN' | 'PHONE' | 'PLATE';

export interface BlockEntry {
    id: string;
    kind: BlockKind;
    value: string;
    name: string | null;
    reason: string;
    createdAt: string;
    createdByName: string | null;
}

/** Кто из уже заведённого совпал с новой записью. */
export interface BlockMatch {
    type: 'COUNTERPARTY' | 'DRIVER' | 'VEHICLE';
    id: string;
    name: string;
    href: string;
}

export const BLOCK_KINDS: { value: BlockKind; label: string; placeholder: string }[] = [
    { value: 'BIN_IIN', label: 'БИН/ИИН', placeholder: '12 цифр' },
    { value: 'PHONE', label: 'Телефон', placeholder: '+7 701 123 45 67' },
    { value: 'PLATE', label: 'Госномер', placeholder: '123ABC02' },
];

export const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
    BIN_IIN: 'БИН/ИИН',
    PHONE: 'Телефон',
    PLATE: 'Госномер',
};

/** Частые причины — в один щелчок; текст можно дописать. */
export const BLOCK_REASONS = ['Взял груз и пропал', 'Не оплатил', 'Подделка документов', 'Срыв погрузки'];
