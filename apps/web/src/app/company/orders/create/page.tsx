import { redirect } from 'next/navigation';

/**
 * Мастер заявки живёт окном поверх журнала (владелец, 08.10.2026), а не
 * отдельной страницей. Этот адрес остался — на него ведут меню «Новая
 * заявка», дашборд, «Копировать» в карточке рейса, запросы ставок, — и
 * переводит в журнал с открытым окном: новая заявка, правка или копия.
 */
export default function CreateOrderRedirect({ searchParams }: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const one = (key: string) => {
        const v = searchParams[key];
        return Array.isArray(v) ? v[0] : v;
    };
    const q = new URLSearchParams();
    const edit = one('edit');
    const from = one('from');
    const quote = one('quoteRequestId');
    if (edit) q.set('edit', edit);
    else if (from) q.set('from', from);
    else q.set('create', '1');
    if (quote) q.set('quoteRequestId', quote);
    redirect(`/company/orders?${q.toString()}`);
}
