import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Склейка классов для компонентов shadcn/ui.
 *
 * `twMerge` разрешает конфликты утилит Tailwind: при `cn('p-2', 'p-4')`
 * остаётся `p-4`, а не оба класса сразу.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
