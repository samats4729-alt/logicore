'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Курс валюты к тенге: сколько тенге за одну единицу и на какой день он объявлен. */
export interface KztRate {
    rate: number | null;
    rateDate: string | null;
}

type Rates = Record<string, KztRate>;

/**
 * Курсы держим недолго: бухгалтер мог загрузить курс Нацбанка, пока
 * логист заводит заявку, и «нет курса» не должно висеть до перезагрузки.
 */
const ЖИВЁТ = 5 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<Rates> }>();

function load(date: string): Promise<Rates> {
    const hit = cache.get(date);
    if (hit && Date.now() - hit.at < ЖИВЁТ) return hit.promise;
    const promise = api.get('/currency/rates', { params: { date } }).then((res) => {
        const out: Rates = {};
        for (const row of Array.isArray(res.data) ? res.data : []) {
            out[String(row.code).toUpperCase()] = { rate: row.rate ?? null, rateDate: row.rateDate ?? null };
        }
        return out;
    });
    // Не получилось — не запоминаем: следующая попытка спросит снова.
    promise.catch(() => cache.delete(date));
    cache.set(date, { at: Date.now(), promise });
    return promise;
}

/**
 * Курсы к тенге на день — те же, по которым сервер пересчитывает ставки
 * заявки при сохранении: свой курс компании, если бухгалтер его задал,
 * иначе курс Нацбанка; на выходные — последний объявленный.
 *
 * `date` — «ГГГГ-ММ-ДД»; `null` — курсы не нужны, ничего не грузим.
 */
export function useKztRates(date: string | null): { rates: Rates | null; loading: boolean; failed: boolean } {
    const [state, setState] = useState<{ date: string | null; rates: Rates | null; failed: boolean }>({
        date: null, rates: null, failed: false,
    });

    useEffect(() => {
        if (!date) return;
        let alive = true;
        load(date)
            .then((rates) => { if (alive) setState({ date, rates, failed: false }); })
            .catch(() => { if (alive) setState({ date, rates: null, failed: true }); });
        return () => { alive = false; };
    }, [date]);

    if (!date) return { rates: null, loading: false, failed: false };
    const current = state.date === date;
    return {
        rates: current ? state.rates : null,
        failed: current && state.failed,
        loading: !current || (!state.rates && !state.failed),
    };
}
