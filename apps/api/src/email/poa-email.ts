/**
 * Письмо с доверенностью на водителя — складу или получателю груза.
 *
 * Владелец, 31.10.2026: «доверенность отправляется, но тело пустое — нужно,
 * чтобы было: откуда куда, какая машина, водитель, его контактные и
 * паспортные данные». Охрана склада сверяет водителя и машину по письму, не
 * открывая вложение, — поэтому всё, что есть в доверенности, есть и в теле.
 *
 * Письмо одно на оба пути отправки: из шапки заявки и из вкладки
 * «Документы». У письма есть и простой текст: часть почтовых программ
 * показывает только его, и без него письмо там выглядит пустым.
 */

/** Точка маршрута для письма: город, адрес, дата. */
export interface PoaEmailPoint {
    city: string;
    address?: string | null;
    /** Название точки: склад, магазин. */
    name?: string | null;
    /** Дата по плану, ISO. */
    date?: string | null;
}

export interface PoaEmailData {
    orderNumber: string;
    senderCompany: string;
    /** Кто отправил — к нему склад обратится, если что-то не сходится. */
    sender?: { name: string; phone?: string | null } | null;
    /** До какого дня действует доверенность, ISO. */
    validTo?: string | null;
    from?: PoaEmailPoint | null;
    to?: PoaEmailPoint | null;
    /** Точек кроме первой погрузки и последней выгрузки. */
    morePoints?: number;
    cargo?: string | null;
    /** Тягач: марка и госномер. */
    vehicle?: string | null;
    trailer?: string | null;
    driver: {
        name: string;
        phone?: string | null;
        /** Документ одной строкой: вид, номер, кем и когда выдан. */
        document?: string | null;
        iin?: string | null;
    };
    /** Имена файлов, приложенных кроме самой доверенности. */
    extraFiles?: string[];
}

const ДАТА = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric' });
const день = (iso?: string | null) => (iso ? ДАТА.format(new Date(iso)) : null);

/**
 * «+77010001403» → «+7 701 000 14 03» неразрывными пробелами: на телефоне
 * номер не разорвётся по строкам. Другой вид номера — как есть.
 */
const телефон = (raw?: string | null) => {
    if (!raw) return raw ?? null;
    const цифры = raw.replace(/\D/g, '');
    const m = /^[78](\d{3})(\d{3})(\d{2})(\d{2})$/.exec(цифры);
    return m ? ['+7', m[1], m[2], m[3], m[4]].join(' ') : raw;
};

/** Текст в письмо — без разметки из данных: в адресе склада может оказаться «<». */
const экран = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Строки раздела: только заполненные — пустых «—» охране сверять нечего. */
type Строка = [string, string | null | undefined];

/**
 * Адрес без города в начале: в справочнике адрес часто записан как «Алматы,
 * Абая 10» или «г. Алматы» — рядом с городом это читается дважды.
 */
function безГорода(city: string, address?: string | null): string | null {
    if (!address) return null;
    const город = city.trim().toLowerCase();
    const чистый = address.trim().replace(/^г\.\s*/i, '');
    if (чистый.toLowerCase() === город) return null;
    if (чистый.toLowerCase().startsWith(город)) {
        const остаток = чистый.slice(город.length).replace(/^[\s,]+/, '');
        if (остаток && остаток !== чистый.slice(город.length)) return остаток;
    }
    return address.trim();
}

function точка(p?: PoaEmailPoint | null): string | null {
    if (!p) return null;
    return [p.city, p.name, безГорода(p.city, p.address), день(p.date)].filter(Boolean).join(', ');
}

/** Тема, тело и простой текст письма. */
export function poaEmail(d: PoaEmailData): { subject: string; html: string; text: string } {
    const маршрут = [d.from?.city, d.to?.city].filter(Boolean).join(' → ');
    const subject = [
        `Доверенность по заявке № ${d.orderNumber}`,
        d.driver.name && d.driver.name !== '—' ? `водитель ${d.driver.name}` : null,
        маршрут || null,
    ].filter(Boolean).join(' · ');

    const разделы = ([
        {
            title: 'Рейс',
            rows: [
                ['Откуда', точка(d.from)],
                ['Куда', точка(d.to)],
                ['Ещё точки', d.morePoints ? `${d.morePoints} — в PDF доверенности` : null],
                ['Груз', d.cargo],
            ],
        },
        {
            title: 'Машина',
            rows: [
                ['Тягач', d.vehicle],
                ['Прицеп', d.trailer],
            ],
        },
        {
            title: 'Водитель',
            rows: [
                ['ФИО', d.driver.name],
                ['Телефон', телефон(d.driver.phone)],
                ['Документ', d.driver.document],
                ['ИИН', d.driver.iin],
            ],
        },
    ] as { title: string; rows: Строка[] }[])
        .map((s) => ({ ...s, rows: s.rows.filter(([, v]) => !!v && v !== '—') }))
        .filter((s) => s.rows.length > 0);

    const вложения = d.extraFiles?.length ? ` Вместе с ней: ${d.extraFiles.join(', ')}.` : '';
    const вступление = `${d.senderCompany} направляет доверенность на водителя по заявке № ${d.orderNumber}. PDF с печатью — во вложении.${вложения}`;
    const срок = день(d.validTo) ? `Доверенность действительна до ${день(d.validTo)}.` : null;
    const отправил = d.sender?.name
        ? `Отправил: ${[d.sender.name, d.senderCompany, телефон(d.sender.phone)].filter(Boolean).join(', ')}`
        : null;

    const раздел = (s: { title: string; rows: Строка[] }) => `
            <div style="margin: 0 0 16px; border: 1px solid #e8e8ec; border-radius: 12px; overflow: hidden;">
                <div style="background: #f4f5f7; padding: 8px 14px; font-size: 12px; font-weight: 600; color: #6b6f7a; text-transform: uppercase; letter-spacing: 0.04em;">${s.title}</div>
                <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                    ${s.rows.map(([k, v], i) => `
                    <tr>
                        <td style="padding: 9px 14px; width: 92px; vertical-align: top; color: #8a8f99; font-size: 13px;${i ? ' border-top: 1px solid #f0f0f3;' : ''}">${k}</td>
                        <td style="padding: 9px 14px; vertical-align: top; color: #0b0d12; font-size: 14px; font-weight: 600; line-height: 1.45;${i ? ' border-top: 1px solid #f0f0f3;' : ''}">${k === 'Телефон' ? `<a href="tel:${экран(String(v).replace(/[^\d+]/g, ''))}" style="color: #1677ff; text-decoration: none;">${экран(String(v))}</a>` : экран(String(v))}</td>
                    </tr>`).join('')}
                </table>
            </div>`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f4f5f7;">
    <div style="max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e8e8ec;">
        <div style="background: #0b0d12; padding: 18px 24px;">
            <span style="color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: -0.3px;">LogiCore</span>
        </div>
        <div style="padding: 24px;">
            <h1 style="margin: 0 0 8px; font-size: 20px; line-height: 1.3; color: #0b0d12;">Доверенность на водителя</h1>
            <p style="margin: 0 0 20px; color: #4a4f5a; font-size: 14px; line-height: 1.55;">${экран(вступление)}</p>
            ${разделы.map(раздел).join('')}
            ${срок ? `<p style="margin: 4px 0 6px; color: #0b0d12; font-size: 14px; font-weight: 600;">${срок}</p>` : ''}
            ${отправил ? `<p style="margin: 0; color: #6b6f7a; font-size: 13px; line-height: 1.5;">${экран(отправил)}</p>` : ''}
        </div>
    </div>
</body>
</html>`;

    const text = [
        'Доверенность на водителя',
        '',
        вступление,
        ...разделы.flatMap((s) => ['', s.title.toUpperCase(), ...s.rows.map(([k, v]) => `${k}: ${v}`)]),
        ...(срок ? ['', срок] : []),
        ...(отправил ? [отправил] : []),
    ].join('\n');

    return { subject, html, text };
}
