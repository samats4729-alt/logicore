export interface CompanyOption {
    id: string;
    name?: string | null;
}

/**
 * Safely resolves the name of a company from a list of options.
 * Fallbacks to fallbackName if provided, or a short formatted UUID to prevent bare UUID rendering.
 */
export function resolveCompanyName(
    companyId: string | null | undefined,
    options: CompanyOption[],
    fallbackName?: string | null
): string {
    if (!companyId) return '—';
    const found = options.find(o => o.id === companyId);
    if (found && found.name?.trim()) return found.name.trim();
    if (fallbackName?.trim()) return fallbackName.trim();
    return `Организация (${companyId.substring(0, 8)})`;
}

/**
 * Prepares select options by ensuring every option has a valid label,
 * and optionally ensuring the selected value is present in the list to prevent raw UUID display.
 */
export function prepareCompanyOptions(
    companies: Array<{ id: string; name?: string | null }>,
    selectedValue?: string | null,
    selectedName?: string | null
): Array<{ value: string; label: string }> {
    const optionsMap = new Map<string, string>();

    // Add all from the list
    for (const c of companies) {
        if (c.id) {
            optionsMap.set(c.id, c.name?.trim() || 'Без названия');
        }
    }

    // Ensure selected value is present
    if (selectedValue && selectedValue !== '__MY_COMPANY__' && selectedValue !== '__MARKETPLACE__' && !optionsMap.has(selectedValue)) {
        optionsMap.set(selectedValue, selectedName?.trim() || 'Без названия');
    }

    return Array.from(optionsMap.entries()).map(([value, label]) => ({
        value,
        label,
    }));
}

/**
 * Shortens common legal structures in company names to their abbreviations.
 * Example: "Товарищество с ограниченной ответственностью Ромашка" -> "ТОО Ромашка"
 */
export function shortenCompanyName(name: string | null | undefined): string {
    if (!name) return '—';
    let trimmed = name.trim();
    
    const replacements = [
        { pattern: /^(Товарищество\s+с\s+ограниченной\s+ответственностью|товарищество\s+с\s+ограниченной\s+ответственностью)\b/i, replacement: 'ТОО' },
        { pattern: /^(Индивидуальный\s+предприниматель|индивидуальный\s+предприниматель)\b/i, replacement: 'ИП' },
        { pattern: /^(Акционерное\s+общество|акционерное\s+общество)\b/i, replacement: 'АО' },
        { pattern: /^(Общество\s+с\s+ограниченной\s+ответственностью|общество\s+с\s+ограниченной\s+ответственностью)\b/i, replacement: 'ООО' },
        { pattern: /^(Производственный\s+кооператив|производственный\s+кооператив)\b/i, replacement: 'ПК' }
    ];

    for (const { pattern, replacement } of replacements) {
        if (pattern.test(trimmed)) {
            trimmed = trimmed.replace(pattern, replacement);
            break;
        }
    }
    
    return trimmed.replace(/\s+/g, ' ').trim();
}
