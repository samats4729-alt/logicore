// Экспорт данных в CSV (UTF-8 с BOM — корректно открывается в Excel с кириллицей).
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const esc = (c: string | number | null | undefined) => `"${String(c ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(r => r.map(esc).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
