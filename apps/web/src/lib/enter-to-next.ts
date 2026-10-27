'use client';

import { useEffect } from 'react';

/**
 * Enter — к следующему полю формы (задачи шефа, E3).
 *
 * Бухгалтеры и логисты привыкли к 1С: набрал число, Enter — и ты в
 * следующей графе. У нас Enter в поле сразу отправлял форму, а к следующему
 * полю вёл только Tab, о котором многие не знают. Теперь Enter в поле
 * формы ведёт к следующему полю, а в последнем — работает как раньше
 * (сохраняет). Tab тоже работает.
 *
 * Где Enter значит своё, его не трогаем: многострочный текст (там Enter —
 * новая строка), выпадающие списки и подсказки (Enter выбирает вариант),
 * поиск, выбор даты, кнопки и галочки. Поле или блок с
 * `data-enter-default` отказывается от перехода целиком.
 */

/** Поля, по которым идёт переход. Кнопки и галочки в цепочку не входят. */
const FIELD_SELECTOR = [
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range])',
    'textarea',
    'select',
    '[role=combobox]',
].join(',');

/** Типы полей, где Enter переводит дальше. */
const TEXT_TYPES = new Set(['', 'text', 'number', 'tel', 'email', 'url', 'password']);

function usable(el: HTMLElement): boolean {
    if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return false;
    if (el.tabIndex < 0) return false;
    if (el.closest('[aria-hidden=true],[inert]')) return false;
    // Приставка к полю (валюта рядом с суммой) — не отдельная графа: её
    // меняют редко, и останавливаться на ней при каждом Enter незачем.
    if (el.closest('.ant-input-group-addon, .ant-input-number-group-addon')) return false;
    // Скрытое поле (свёрнутая секция, вкладка) фокус не примет.
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
}

/** Поле, в котором Enter должен перевести к следующему; иначе null. */
function sourceField(target: EventTarget | null): HTMLInputElement | null {
    if (!(target instanceof HTMLInputElement)) return null;
    if (!TEXT_TYPES.has((target.getAttribute('type') || '').toLowerCase())) return null;
    if (target.closest('[data-enter-default]')) return null;
    // Подсказки, выпадающие списки, поиск в окнах выбора — Enter выбирает.
    if (target.getAttribute('role') === 'combobox' || target.hasAttribute('aria-autocomplete')) return null;
    if (target.getAttribute('aria-expanded') === 'true') return null;
    if (target.closest('.ant-select, .ant-picker, .ant-input-search, [cmdk-root], [role=listbox], [role=menu]')) return null;
    return target;
}

/** Следующее поле той же формы после `from` — или null, если `from` последнее. */
export function nextFieldAfter(from: HTMLElement): HTMLElement | null {
    const scope = from.closest('form');
    if (!scope) return null;
    const fields = Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(usable);
    const index = fields.indexOf(from);
    if (index < 0) return null;
    return fields[index + 1] ?? null;
}

function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const field = sourceField(event.target);
    if (!field) return;
    const next = nextFieldAfter(field);
    // Последнее поле — Enter делает то, что делал: отправляет форму.
    if (!next) return;
    event.preventDefault();
    next.focus();
    if (next instanceof HTMLInputElement && TEXT_TYPES.has(next.type)) {
        try { next.select(); } catch { /* у числовых полей выделения нет */ }
    }
}

/** Включить переход по Enter во всех формах кабинета. Ставится один раз — в макете кабинета. */
export function useEnterToNextField() {
    useEffect(() => {
        // Слушаем на всплытии: если поле само обработало Enter (подсказка
        // выбрала вариант), событие придёт уже отменённым и мы его не тронем.
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);
}
