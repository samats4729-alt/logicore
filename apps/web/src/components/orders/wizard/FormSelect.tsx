'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Пустое значение для «не выбрано»: у выпадающего списка shadcn пустых значений не бывает. */
const NONE = '__none__';

/**
 * Выбор из короткого списка в стиле shadcn — для полей мастера на форме antd.
 *
 * Ant Design \`Form.Item\` передаёт полю \`value\` и \`onChange(value)\`: этот
 * список отвечает ровно этим, поэтому привязка к форме, проверки и черновик
 * работают как с прежним Select. Только для коротких неизменных списков —
 * тип документа, кузов, организация; справочники с поиском остаются
 * полями с поиском (правило владельца от 27.07).
 */
export function FormSelect({ id, value, onChange, options, placeholder = 'Выберите', allowClear, clearLabel = 'Не указано', className, disabled, 'aria-label': ariaLabel }: {
    id?: string;
    value?: string | null;
    onChange?: (value: string | undefined) => void;
    options: { value: string; label: React.ReactNode }[];
    placeholder?: string;
    /** Можно вернуть «не выбрано». */
    allowClear?: boolean;
    clearLabel?: string;
    className?: string;
    disabled?: boolean;
    'aria-label'?: string;
}) {
    return (
        <Select
            value={value ?? (allowClear ? NONE : undefined) ?? ''}
            onValueChange={(v) => onChange?.(v === NONE ? undefined : v)}
            disabled={disabled}
        >
            <SelectTrigger id={id} aria-label={ariaLabel} className={cn('h-8 w-full rounded-lg text-[13px] text-foreground', className)}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {allowClear && <SelectItem value={NONE} className="text-[13px] text-muted-foreground">{clearLabel}</SelectItem>}
                {options.map((o) => <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}
