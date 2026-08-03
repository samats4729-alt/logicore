import { toast } from 'sonner';
import { api } from './api';

/**
 * Поиск реквизитов компании по БИН в государственном реестре.
 *
 * Одно и то же место в шести формах: человек вводит БИН, и поля названия,
 * адреса и руководителя заполняются сами. Раньше каждая форма делала это
 * своим куском кода, и все шесть гасили ошибку молча (`catch {}`). Для
 * человека это выглядело одинаково — «ввёл БИН, ничего не произошло», —
 * хотя причины разные: компании нет в реестре, реестр не отвечает, или
 * ключ доступа к реестру вообще не задан на сервере. Не зная причины,
 * человек либо ждёт, либо решает, что сломалось у него.
 *
 * Поэтому: находка — заполняем и говорим об этом; не нашли — говорим, что
 * не нашли, и человек вводит руками; сбой — называем сбой.
 */
export interface CompanyByBin {
    name?: string;
    address?: string;
    directorName?: string;
    phone?: string;
    email?: string;
}

export async function lookupCompanyByBin(bin: string): Promise<CompanyByBin | null> {
    try {
        const res = await api.get(`/auth/company-lookup/${bin}`);
        if (res.data) {
            toast.success('Реквизиты подтянуты из реестра', { id: 'bin-lookup' });
            return res.data as CompanyByBin;
        }
        // Пустой ответ — обычное дело: не каждый БИН есть в реестре.
        toast.info('По этому БИН в реестре ничего нет — заполните поля вручную', { id: 'bin-lookup' });
        return null;
    } catch (e: any) {
        toast.error(
            e?.response?.data?.message || 'Реестр не ответил — заполните поля вручную',
            { id: 'bin-lookup' },
        );
        return null;
    }
}

/** Только те поля, что пришли: пустым значением затирать введённое нельзя. */
export function companyFieldsFromLookup(
    found: CompanyByBin,
    options: { withAddress?: boolean; withDirector?: boolean; actualAddressToo?: boolean } = {},
): Record<string, string> {
    const fields: Record<string, string> = {};
    if (found.name) fields.name = found.name;
    if (options.withAddress && found.address) {
        fields.address = found.address;
        if (options.actualAddressToo) fields.actualAddress = found.address;
    }
    if (options.withDirector && found.directorName) fields.directorName = found.directorName;
    if (found.phone) fields.phone = found.phone;
    if (found.email) fields.email = found.email;
    return fields;
}
