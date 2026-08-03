import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BASE_CURRENCY, CURRENCY_CATALOG } from './currency-catalog';
import { nbkDateParam, parseNbkRates } from './nbk-rates.parser';

/** Откуда берём официальный курс. */
const NBK_URL = 'https://nationalbank.kz/rss/get_rates.cfm';
/** Сеть может молчать сколько угодно — приложение ждать столько не может. */
const FETCH_TIMEOUT_MS = 20_000;

export interface RateRow {
    code: string;
    nameRu: string;
    symbol: string | null;
    quant: number;
    isCommon: boolean;
    hasOfficialRate: boolean;
    /** Тенге за одну единицу. Для тенге всегда 1. */
    rate: number | null;
    /** На какую дату этот курс объявлен. Может быть раньше запрошенной. */
    rateDate: string | null;
    /** Курс и кратность как их отдал Нацбанк — для сверки с сайтом. */
    sourceRate: number | null;
    sourceQuant: number | null;
    source: string | null;
    note: string | null;
    /** Курс объявлен раньше запрошенной даты: выходные и праздники. */
    isCarriedOver: boolean;
    /** Изменение к предыдущему объявленному курсу, в тенге. */
    change: number | null;
}

/** Дата без времени: курс объявляется на день, а не на момент. */
function atMidnightUtc(value: string | Date): Date {
    const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Неверная дата');
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const asDay = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class CurrencyService {
    private readonly logger = new Logger('CurrencyService');

    constructor(private prisma: PrismaService) { }

    /**
     * Завести справочник валют, если его ещё нет.
     *
     * Названия и порядок обновляем при каждом запуске: справочник живёт в
     * коде, и правка названия должна доезжать. Кратность не трогаем — её
     * главный источник Нацбанк, она приходит с курсом.
     */
    async ensureCatalog() {
        for (const currency of CURRENCY_CATALOG) {
            await this.prisma.currency.upsert({
                where: { code: currency.code },
                create: {
                    code: currency.code,
                    nameRu: currency.nameRu,
                    symbol: currency.symbol ?? null,
                    quant: currency.quant,
                    isCommon: currency.isCommon,
                    hasOfficialRate: currency.hasOfficialRate ?? true,
                    sortOrder: currency.sortOrder,
                },
                update: {
                    nameRu: currency.nameRu,
                    symbol: currency.symbol ?? null,
                    isCommon: currency.isCommon,
                    hasOfficialRate: currency.hasOfficialRate ?? true,
                    sortOrder: currency.sortOrder,
                },
            });
        }
        return this.prisma.currency.count();
    }

    listCurrencies() {
        return this.prisma.currency.findMany({
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
    }

    /**
     * Курс валюты на дату.
     *
     * С откатом назад: берётся последняя запись не позже нужного дня. Это
     * нужно для дней, которые в базу не попали, — сервис Нацбанка был
     * недоступен, компания начала работать позже, документ проводят задним
     * числом. Без отката такой документ остался бы без курса вовсе, а это
     * пустая сумма в счёте.
     */
    async rateOn(code: string, date: string | Date): Promise<{ rate: Prisma.Decimal; rateDate: Date } | null> {
        if (code === BASE_CURRENCY) {
            return { rate: new Prisma.Decimal(1), rateDate: atMidnightUtc(date) };
        }
        const row = await this.prisma.exchangeRate.findFirst({
            where: { currencyCode: code, rateDate: { lte: atMidnightUtc(date) } },
            orderBy: { rateDate: 'desc' },
            select: { rate: true, rateDate: true },
        });
        return row ?? null;
    }

    /**
     * Таблица курсов на дату — то, что видит человек на экране.
     *
     * Для каждой валюты берётся последний курс не позже запрошенного дня, и
     * отдельно помечается, что он «перенесён» с прежней даты: человек должен
     * видеть разницу между «курс на сегодня» и «сегодня курса не было».
     */
    async ratesOn(date: string, options: { onlyCommon?: boolean } = {}): Promise<RateRow[]> {
        const day = atMidnightUtc(date);
        const currencies = await this.prisma.currency.findMany({
            where: options.onlyCommon ? { isCommon: true } : {},
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });

        // Два последних курса на каждую валюту: второй нужен, чтобы показать
        // изменение — бухгалтер смотрит на движение, а не на голое число.
        const rows: RateRow[] = [];
        for (const currency of currencies) {
            if (currency.code === BASE_CURRENCY) {
                rows.push({
                    code: currency.code,
                    nameRu: currency.nameRu,
                    symbol: currency.symbol,
                    quant: currency.quant,
                    isCommon: currency.isCommon,
                    hasOfficialRate: currency.hasOfficialRate,
                    rate: 1,
                    rateDate: asDay(day),
                    sourceRate: null,
                    sourceQuant: null,
                    source: 'BASE',
                    note: null,
                    isCarriedOver: false,
                    change: null,
                });
                continue;
            }

            const last = await this.prisma.exchangeRate.findMany({
                where: { currencyCode: currency.code, rateDate: { lte: day } },
                orderBy: { rateDate: 'desc' },
                take: 2,
            });
            const current = last[0];
            const previous = last[1];

            rows.push({
                code: currency.code,
                nameRu: currency.nameRu,
                symbol: currency.symbol,
                quant: currency.quant,
                isCommon: currency.isCommon,
                hasOfficialRate: currency.hasOfficialRate,
                rate: current ? Number(current.rate) : null,
                rateDate: current ? asDay(current.rateDate) : null,
                sourceRate: current?.sourceRate ? Number(current.sourceRate) : null,
                sourceQuant: current?.sourceQuant ?? null,
                source: current?.source ?? null,
                note: current?.note ?? null,
                isCarriedOver: !!current && asDay(current.rateDate) !== asDay(day),
                change: current && previous ? Number(current.rate) - Number(previous.rate) : null,
            });
        }
        return rows;
    }

    /** История одной валюты за период — для проверки глазами. */
    async history(code: string, from: string, to: string) {
        return this.prisma.exchangeRate.findMany({
            where: {
                currencyCode: code,
                rateDate: { gte: atMidnightUtc(from), lte: atMidnightUtc(to) },
            },
            orderBy: { rateDate: 'desc' },
            include: { createdBy: { select: { firstName: true, lastName: true } } },
        });
    }

    /**
     * Загрузить курсы Нацбанка на дату.
     *
     * Что здесь важно и неочевидно:
     *
     * 1. Дата берётся ИЗ ФАЙЛА, а не из запроса. Проверено на живом сервисе:
     *    на выходные Нацбанк отдаёт файл, помеченный запрошенной датой, но с
     *    числами последнего рабочего дня — то есть по субботе и воскресенью
     *    действует пятничный курс. Дата из файла — единственное, что сам
     *    сервис считает правдой, поэтому верим ей; если формат когда-нибудь
     *    поменяется и дата придёт другая, мы сохраним её, а не выдуманную.
     * 2. Уже сохранённый курс, поставленный руками, автоматической загрузкой
     *    не затирается. Человек ставил его осознанно — возможно, по договору.
     */
    async importFromNbk(date: string, options: { userId?: string } = {}) {
        const requested = atMidnightUtc(date);
        const xml = await this.fetchNbk(requested);
        const parsed = parseNbkRates(xml);

        if (!parsed.rates.length) {
            throw new BadRequestException('Нацбанк вернул файл без курсов');
        }

        // Дата из файла — главная. Формат в файле «01.08.2026».
        const fileDay = parsed.date && /^\d{2}\.\d{2}\.\d{4}$/.test(parsed.date)
            ? atMidnightUtc(parsed.date.split('.').reverse().join('-'))
            : requested;

        const known = new Set((await this.prisma.currency.findMany({ select: { code: true } })).map((c) => c.code));
        let saved = 0;
        let skippedManual = 0;
        const unknown: string[] = [];

        for (const rate of parsed.rates) {
            if (rate.code === BASE_CURRENCY) continue;
            if (!known.has(rate.code)) { unknown.push(rate.code); continue; }

            const existing = await this.prisma.exchangeRate.findUnique({
                where: { currencyCode_rateDate: { currencyCode: rate.code, rateDate: fileDay } },
                select: { id: true, source: true },
            });
            if (existing?.source === 'MANUAL') { skippedManual += 1; continue; }

            await this.prisma.exchangeRate.upsert({
                where: { currencyCode_rateDate: { currencyCode: rate.code, rateDate: fileDay } },
                create: {
                    currencyCode: rate.code,
                    rateDate: fileDay,
                    rate: new Prisma.Decimal(rate.rate.toFixed(6)),
                    sourceRate: new Prisma.Decimal(rate.sourceRate.toFixed(6)),
                    sourceQuant: rate.quant,
                    source: 'NBK',
                    createdById: options.userId ?? null,
                },
                update: {
                    rate: new Prisma.Decimal(rate.rate.toFixed(6)),
                    sourceRate: new Prisma.Decimal(rate.sourceRate.toFixed(6)),
                    sourceQuant: rate.quant,
                    source: 'NBK',
                },
            });
            saved += 1;

            // Кратность в справочнике — наша копия; главная у Нацбанка.
            // Расхождение не ломает загрузку, но молчать о нём нельзя:
            // изменение кратности меняет курс в 10 или 100 раз.
            const catalogQuant = CURRENCY_CATALOG.find((c) => c.code === rate.code)?.quant;
            if (catalogQuant && catalogQuant !== rate.quant) {
                this.logger.warn(
                    `Кратность ${rate.code} изменилась: в справочнике ${catalogQuant}, у Нацбанка ${rate.quant}`,
                );
            }
        }

        if (unknown.length) {
            this.logger.warn(`Нацбанк прислал валюты, которых нет в справочнике: ${unknown.join(', ')}`);
        }

        return {
            requestedDate: asDay(requested),
            rateDate: asDay(fileDay),
            /** Курс объявлен на другую дату: выходные, праздники, раннее утро. */
            isCarriedOver: asDay(fileDay) !== asDay(requested),
            saved,
            skippedManual,
            unknown,
        };
    }

    /**
     * Догрузить курсы за период.
     *
     * Нужно после того, как сервис Нацбанка был недоступен: дыры в истории
     * означают, что документ задним числом не сможет получить курс своей
     * даты. Ограничение по длине периода намеренное — это поход в чужой
     * сервис, а не запрос к своей базе.
     */
    async backfill(from: string, to: string, options: { userId?: string } = {}) {
        const start = atMidnightUtc(from);
        const end = atMidnightUtc(to);
        if (start > end) throw new BadRequestException('Начало периода позже конца');

        const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
        if (days > 92) throw new BadRequestException('За один раз можно догрузить не больше трёх месяцев');

        const done: string[] = [];
        const failed: { date: string; reason: string }[] = [];
        for (let i = 0; i < days; i += 1) {
            const day = new Date(start.getTime() + i * 86_400_000);
            try {
                const result = await this.importFromNbk(asDay(day), options);
                done.push(result.rateDate);
            } catch (e: any) {
                failed.push({ date: asDay(day), reason: e?.message || 'неизвестная ошибка' });
            }
        }
        return { days, loaded: [...new Set(done)].length, failed };
    }

    /**
     * Поставить курс руками.
     *
     * Зачем это есть: у туркменского маната официального курса Нацбанка
     * нет вовсе, сервис бывает недоступен, а иногда в договоре с клиентом
     * зафиксирован свой курс. Ручной курс помечается и не затирается
     * автоматической загрузкой — иначе человек поставил бы его, а ночью
     * оно молча вернулось бы к официальному.
     */
    async setManualRate(input: {
        code: string;
        date: string;
        rate: number;
        note?: string;
        userId?: string;
    }) {
        const currency = await this.prisma.currency.findUnique({ where: { code: input.code } });
        if (!currency) throw new NotFoundException('Валюта не найдена в справочнике');
        if (input.code === BASE_CURRENCY) {
            throw new BadRequestException('У тенге не бывает курса к тенге');
        }
        if (!(input.rate > 0)) throw new BadRequestException('Курс должен быть больше нуля');

        const day = atMidnightUtc(input.date);
        return this.prisma.exchangeRate.upsert({
            where: { currencyCode_rateDate: { currencyCode: input.code, rateDate: day } },
            create: {
                currencyCode: input.code,
                rateDate: day,
                rate: new Prisma.Decimal(input.rate.toFixed(6)),
                source: 'MANUAL',
                note: input.note?.slice(0, 300) || null,
                createdById: input.userId ?? null,
            },
            update: {
                rate: new Prisma.Decimal(input.rate.toFixed(6)),
                source: 'MANUAL',
                note: input.note?.slice(0, 300) || null,
                createdById: input.userId ?? null,
            },
        });
    }

    /** Убрать ручной курс — вернуться к официальному. */
    async removeManualRate(code: string, date: string) {
        const day = atMidnightUtc(date);
        const existing = await this.prisma.exchangeRate.findUnique({
            where: { currencyCode_rateDate: { currencyCode: code, rateDate: day } },
        });
        if (!existing) throw new NotFoundException('Курс на эту дату не найден');
        if (existing.source !== 'MANUAL') {
            throw new BadRequestException('Официальный курс Нацбанка удалять нельзя');
        }
        await this.prisma.exchangeRate.delete({ where: { id: existing.id } });
        return { removed: true };
    }

    private async fetchNbk(date: Date): Promise<string> {
        const url = `${NBK_URL}?fdate=${nbkDateParam(date)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                throw new BadRequestException(`Нацбанк ответил ошибкой ${response.status}`);
            }
            return await response.text();
        } catch (e: any) {
            if (e instanceof BadRequestException) throw e;
            // Понятная причина вместо «fetch failed»: этот текст увидит бухгалтер.
            throw new BadRequestException(
                e?.name === 'AbortError'
                    ? 'Сайт Нацбанка не ответил вовремя — попробуйте позже'
                    : 'Не удалось связаться с сайтом Нацбанка',
            );
        } finally {
            clearTimeout(timer);
        }
    }
}
