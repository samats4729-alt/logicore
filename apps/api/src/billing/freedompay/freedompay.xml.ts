/**
 * Разговор с платёжной системой идёт в XML.
 *
 * XML тут вырожденный: один уровень вложенности, только текст внутри тегов.
 * Ответ на запрос ссылки выглядит так и никак иначе:
 *
 *   <?xml version="1.0" encoding="utf-8"?>
 *   <response>
 *     <pg_status>ok</pg_status>
 *     <pg_payment_id>123456</pg_payment_id>
 *     <pg_redirect_url>https://...</pg_redirect_url>
 *     <pg_salt>...</pg_salt>
 *     <pg_sig>...</pg_sig>
 *   </response>
 *
 * Поэтому здесь нет библиотеки разбора XML: на такой формат её ставить —
 * тащить в зависимости и в сборку то, что заменяется двадцатью строками.
 * Ограничение записано честно: вложенные теги этот разбор не понимает, и
 * если платёжная система однажды пришлёт дерево, разбор вернёт по такому
 * тегу сырой кусок, а не объект.
 */

/** Плоский разбор: все теги с текстом внутри, на любой глубине. */
export function parseFlatXml(xml: string): Record<string, string> {
    const результат: Record<string, string> = {};
    // `[^<]*` в середине — не лень, а способ отличить лист от обёртки.
    // Внутри `<response>` есть другие теги, значит есть `<`, значит обёртка
    // под это правило не подходит и в результат не попадает сама собой.
    // Побочное следствие: пустой тег без содержимого (`<pg_x/>`) не
    // распознаётся — платёжная система таких не шлёт, шлёт `<pg_x></pg_x>`.
    const тег = /<([a-zA-Z_][\w.-]*)>([^<]*)<\/\1>/g;
    let найдено: RegExpExecArray | null;
    while ((найдено = тег.exec(xml)) !== null) {
        const [, имя, значение] = найдено;
        результат[имя] = decodeEntities(значение.trim());
    }
    return результат;
}

/** Собрать ответ платёжной системе. Порядок тегов значения не имеет. */
export function buildXmlResponse(params: Record<string, string | number>): string {
    const теги = Object.entries(params)
        .map(([имя, значение]) => `  <${имя}>${escapeXml(String(значение))}</${имя}>`)
        .join('\n');
    return `<?xml version="1.0" encoding="utf-8"?>\n<response>\n${теги}\n</response>`;
}

function decodeEntities(текст: string): string {
    return текст
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        // `&amp;` расшифровывается последним: иначе «&amp;lt;» превратилось бы
        // в «<», хотя в исходнике написан текст «&lt;».
        .replace(/&amp;/g, '&');
}

function escapeXml(текст: string): string {
    return текст
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
