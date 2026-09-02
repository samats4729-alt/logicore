import {
    Injectable,
    Logger,
    BadRequestException,
    BadGatewayException,
    ServiceUnavailableException,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import { BillingService } from '../billing.service';
import { FreedomPayService, FreedomPayRefusal } from './freedompay.service';

/**
 * Оплата подписки картой: сторона платформы.
 *
 * Правило, вокруг которого всё построено: **подписку продлевает не браузер,
 * а сервер платёжной системы**. Человек, вернувшийся на страницу «оплачено»,
 * ничего не доказывает — на неё можно зайти руками, набрав адрес. Поэтому
 * возврат в браузере только показывает состояние, а месяцы прибавляет
 * подписанный ответ на `/billing/freedompay/result`.
 *
 * Второе правило: этот ответ приходит столько раз, сколько нужно, — шлюз
 * повторяет его, пока не получит внятное «принято». Поэтому продление
 * закрыто отметкой `appliedAt`, и второй такой же ответ месяцев уже не
 * добавит.
 */

/**
 * Сколько незаконченная оплата считается «той же самой».
 *
 * Человек нажал «Оплатить картой», передумал, вернулся и нажал снова — это
 * одна попытка, а не две. Без этого в списке платежей копились бы брошенные
 * записи, а у владельца в отчёте — вопросы, за что три платежа по 15 000.
 */
const ПОВТОР_МС = 30 * 60 * 1000;

@Injectable()
export class CardPaymentService {
    private readonly logger = new Logger(CardPaymentService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly freedompay: FreedomPayService,
        private readonly billing: BillingService,
        private readonly telegram: TelegramService,
        private readonly config: ConfigService,
    ) { }

    /** Настроена ли оплата картой — от этого зависит кнопка в кабинете. */
    доступна(): boolean {
        return this.freedompay.готов();
    }

    // ==================== Кабинет компании ====================

    /**
     * Начать оплату: завести платёж и получить адрес формы банка.
     *
     * Сумму считает сервер по тому же правилу, что и счёт: цену назначает
     * владелец платформы, и присланная из браузера сумма не имеет значения.
     */
    async start(
        companyId: string,
        user: { id?: string; email?: string },
        data: { months: number },
    ): Promise<{ paymentId: string; redirectUrl: string; amount: number; months: number }> {
        const { enabled } = await this.billing.getSettings();
        if (!enabled) {
            throw new BadRequestException('Оплата на платформе пока не включена');
        }
        if (!this.freedompay.готов()) {
            throw new BadRequestException('Оплата картой не настроена — попросите счёт');
        }

        const счёт = await this.billing.getPurchaseQuote(companyId, data.months);
        if (счёт.amount <= 0) {
            throw new BadRequestException('Цена подписки не назначена — оплатить нечего');
        }

        const незаконченная = await this.prisma.subscriptionPayment.findFirst({
            where: {
                companyId,
                status: SubscriptionPaymentStatus.PENDING,
                months: счёт.months,
                amount: счёт.amount,
                redirectUrl: { not: null },
                createdAt: { gt: new Date(Date.now() - ПОВТОР_МС) },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (незаконченная?.redirectUrl) {
            return {
                paymentId: незаконченная.id,
                redirectUrl: незаконченная.redirectUrl,
                amount: незаконченная.amount,
                months: незаконченная.months,
            };
        }

        // Запись заводится ДО похода в платёжную систему: её номер уходит
        // туда как номер заказа, и другого способа узнать потом, чей это
        // платёж, у нас нет.
        const платёж = await this.prisma.subscriptionPayment.create({
            data: {
                companyId,
                months: счёт.months,
                amount: счёт.amount,
                users: счёт.users,
                planId: счёт.planId,
                initiatedById: user.id ?? null,
            },
        });

        try {
            const { redirectUrl, providerPaymentId } = await this.freedompay.initPayment({
                paymentId: платёж.id,
                amount: платёж.amount,
                currency: платёж.currency,
                description: `LogiCore, подписка на ${месяцевСловом(платёж.months)} — ${счёт.companyName}`,
                successUrl: this.страницаПлатежа(платёж.id),
                failureUrl: `${this.страницаПлатежа(платёж.id)}?failed=1`,
                userId: user.id ?? null,
                email: user.email ?? null,
            });

            await this.prisma.subscriptionPayment.update({
                where: { id: платёж.id },
                data: { redirectUrl, providerPaymentId },
            });

            return {
                paymentId: платёж.id,
                redirectUrl,
                amount: платёж.amount,
                months: платёж.months,
            };
        } catch (error: any) {
            const причина = String(error?.message || error).slice(0, 300);

            // Платёж уже заведён, а ссылки нет: помечаем сразу, иначе он
            // навсегда останется висеть «в ожидании» и попадёт в отчёт как
            // неоплаченный.
            await this.prisma.subscriptionPayment.update({
                where: { id: платёж.id },
                data: {
                    status: SubscriptionPaymentStatus.FAILED,
                    failureCode: error?.code ?? null,
                    failureDescription: причина,
                },
            });
            this.logger.error(`Не удалось начать оплату ${платёж.id}: ${причина}`);

            // Владельцу платформы — сразу. Сорвавшаяся оплата это не «сбой у
            // клиента», а сломанная настройка: сама она не починится, а
            // компания в это время не может заплатить.
            await this.сообщитьВладельцу(
                'Оплата картой не запускается\n\n'
                + `${счёт.companyName}\n`
                + `${причина}\n\n`
                + 'Проверьте плашку «Оплата картой» в админке.',
            );

            // Отказ шлюза и «не дозвонились» — разные поломки, и человеку
            // это разные новости. «Попробуйте позже» на отказе по неверному
            // ключу — прямая ложь: позже будет ровно то же самое.
            if (error instanceof FreedomPayRefusal) {
                throw new BadGatewayException(
                    `Платёжная система отклонила запрос: ${error.причина}. `
                    + 'Мы уже знаем об этом — пока можно попросить счёт.',
                );
            }
            throw new ServiceUnavailableException(
                'Платёжная система сейчас не отвечает. Попробуйте через несколько минут или попросите счёт.',
            );
        }
    }

    /** Состояние платежа для страницы возврата. Только свои платежи. */
    async getStatus(companyId: string, paymentId: string) {
        const платёж = await this.prisma.subscriptionPayment.findFirst({
            where: { id: paymentId, companyId },
            select: {
                id: true, months: true, amount: true, users: true, status: true,
                paidAt: true, appliedAt: true, failureDescription: true,
                cardPan: true, redirectUrl: true, createdAt: true,
            },
        });
        if (!платёж) throw new NotFoundException('Платёж не найден');
        return платёж;
    }

    // ==================== Владелец платформы ====================

    /**
     * Оплаты картой — для страницы «Тариф и подписки».
     *
     * Без этого списка про деньги, пришедшие картой, владелец знает только
     * из телеграма: подписка продлевается сама, и в админке от платежа не
     * остаётся ничего. Особенно это важно для платежей с расхождением —
     * деньги приняты, подписка не продлена, и разбираться с ними некому,
     * пока их не видно.
     */
    async listPayments(limit = 100) {
        return this.prisma.subscriptionPayment.findMany({
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(limit, 1), 500),
            include: { company: { select: { id: true, name: true, bin: true } } },
        });
    }

    // ==================== Ответы платёжной системы ====================

    /**
     * «Этот заказ ещё можно оплатить?» — шлюз спрашивает до списания.
     *
     * Отвечаем «нет» на чужой, оплаченный или отменённый заказ: деньги тогда
     * не спишутся вовсе, и возвращать будет нечего.
     */
    async handleCheck(url: string, тело: Record<string, string>): Promise<string> {
        if (!this.freedompay.подписьВерна(url, тело)) {
            this.logger.warn('Проверка заказа с неверной подписью — отказано');
            return this.freedompay.ответ(url, {
                pg_status: 'error',
                pg_error_description: 'Неверная подпись',
            });
        }

        const платёж = await this.найтиПлатёж(тело);
        if (!платёж) {
            return this.freedompay.ответ(url, {
                pg_status: 'rejected',
                pg_description: 'Платёж не найден',
            });
        }
        if (платёж.status !== SubscriptionPaymentStatus.PENDING) {
            return this.freedompay.ответ(url, {
                pg_status: 'rejected',
                pg_description: 'Этот платёж уже завершён',
            });
        }
        if (!этоНашаСумма(тело, платёж.amount)) {
            return this.freedompay.ответ(url, {
                pg_status: 'rejected',
                pg_description: 'Сумма не совпадает с заказом',
            });
        }

        return this.freedompay.ответ(url, {
            pg_status: 'ok',
            pg_description: 'Заказ подтверждён',
        });
    }

    /**
     * Результат оплаты. Единственное место, где подписка продлевается за
     * деньги без участия человека.
     */
    async handleResult(url: string, тело: Record<string, string>): Promise<string> {
        if (!this.freedompay.подписьВерна(url, тело)) {
            // Ровно то, от чего защищаемся: адрес открыт всем, и «оплачено»
            // без ключа мог бы прислать кто угодно.
            this.logger.warn('Результат оплаты с неверной подписью — проигнорирован');
            return this.freedompay.ответ(url, {
                pg_status: 'error',
                pg_error_description: 'Неверная подпись',
            });
        }

        const платёж = await this.найтиПлатёж(тело);
        if (!платёж) {
            this.logger.warn(`Результат по неизвестному платежу ${тело.pg_order_id}`);
            return this.freedompay.ответ(url, {
                pg_status: 'error',
                pg_error_description: 'Платёж не найден',
            });
        }

        const общее = {
            providerPaymentId: тело.pg_payment_id || платёж.providerPaymentId,
            cardPan: тело.pg_card_pan || платёж.cardPan,
        };

        if (String(тело.pg_result) !== '1') {
            if (платёж.status === SubscriptionPaymentStatus.PENDING) {
                await this.prisma.subscriptionPayment.update({
                    where: { id: платёж.id },
                    data: {
                        ...общее,
                        status: SubscriptionPaymentStatus.FAILED,
                        failureCode: тело.pg_failure_code || null,
                        failureDescription: тело.pg_failure_description || 'Банк отклонил оплату',
                    },
                });
            } else if (платёж.status === SubscriptionPaymentStatus.SUCCESS) {
                // Отказ по уже оплаченному — так быть не должно. Оплату не
                // отменяем (деньги на нашем счету, и решать тут человеку), но
                // в журнале след оставляем: с этой строки начнётся разбор,
                // если однажды не сойдётся выписка.
                this.logger.error(
                    `Отказ по уже оплаченному платежу ${платёж.id}: `
                    + `${тело.pg_failure_code || ''} ${тело.pg_failure_description || ''}`.trim(),
                );
            }
            return this.freedompay.ответ(url, { pg_status: 'ok', pg_description: 'Отказ принят' });
        }

        // Сумма сверяется даже при верной подписи: подпись подтверждает, что
        // сообщение от платёжной системы, но не то, что списали столько,
        // сколько мы просили. Разошлись — деньги принимаем, а месяцы не
        // добавляем: разбираться должен живой человек.
        if (!этоНашаСумма(тело, платёж.amount)) {
            await this.prisma.subscriptionPayment.update({
                where: { id: платёж.id },
                data: {
                    ...общее,
                    status: SubscriptionPaymentStatus.SUCCESS,
                    paidAt: new Date(),
                    failureDescription:
                        `Оплачено ${тело.pg_amount} ${тело.pg_currency || платёж.currency}, `
                        + `а ожидалось ${платёж.amount} ${платёж.currency} — подписка не продлена автоматически`,
                },
            });
            await this.сообщитьВладельцу(
                'Оплата картой с расхождением\n\n'
                + `Платёж ${платёж.id}\n`
                + `Ожидали ${платёж.amount.toLocaleString('ru-RU')} ₸, пришло ${тело.pg_amount}\n`
                + 'Подписка НЕ продлена — продлите вручную в админке.',
            );
            return this.freedompay.ответ(url, { pg_status: 'ok', pg_description: 'Оплата принята' });
        }

        // Захват платежа: продлить может только тот вызов, который первым
        // поставил отметку. Повторный ответ шлюза увидит `count === 0` и
        // месяцев уже не добавит.
        //
        // `paidAt` — время, когда мы получили подтверждение, а не время
        // списания в банке: часовой пояс шлюза нам неизвестен, а выдумывать
        // его в поле, по которому потом сверяют выписку, нельзя.
        const захват = await this.prisma.subscriptionPayment.updateMany({
            where: { id: платёж.id, appliedAt: null },
            data: {
                ...общее,
                status: SubscriptionPaymentStatus.SUCCESS,
                paidAt: платёж.paidAt ?? new Date(),
                appliedAt: new Date(),
            },
        });
        if (захват.count === 0) {
            return this.freedompay.ответ(url, { pg_status: 'ok', pg_description: 'Уже принято' });
        }

        try {
            const подписка = await this.billing.updateCompanySubscription(платёж.companyId, {
                months: платёж.months,
                planId: платёж.planId ?? undefined,
                note: `Оплата картой ${платёж.amount.toLocaleString('ru-RU')} ₸ · ${месяцевСловом(платёж.months)}`,
            });

            await this.сообщитьВладельцу(
                'Оплата картой прошла\n\n'
                + `${платёж.company?.name ?? 'Компания'}`
                + `${платёж.company?.bin ? ` · БИН ${платёж.company.bin}` : ''}\n`
                + `${месяцевСловом(платёж.months)} · ${платёж.amount.toLocaleString('ru-RU')} ₸\n`
                + (подписка.periodEnd
                    ? `Подписка активна до ${подписка.periodEnd.toLocaleDateString('ru-RU')}`
                    : 'Подписка продлена'),
            );
        } catch (error: any) {
            // Отметку снимаем: иначе деньги приняты, подписка не продлена, а
            // повторный ответ шлюза пройдёт мимо. Пусть лучше придёт ещё раз.
            await this.prisma.subscriptionPayment.update({
                where: { id: платёж.id },
                data: { appliedAt: null },
            });
            this.logger.error(
                `Оплата ${платёж.id} прошла, но подписка не продлилась: ${error?.message || error}`,
            );
            return this.freedompay.ответ(url, {
                pg_status: 'error',
                pg_error_description: 'Не удалось продлить подписку, пришлите результат ещё раз',
            });
        }

        return this.freedompay.ответ(url, { pg_status: 'ok', pg_description: 'Оплата принята' });
    }

    // ==================== Мелочи ====================

    private async найтиПлатёж(тело: Record<string, string>) {
        const id = String(тело.pg_order_id || '').trim();
        if (!id) return null;
        return this.prisma.subscriptionPayment.findUnique({
            where: { id },
            include: { company: { select: { name: true, bin: true } } },
        });
    }

    /** Адрес страницы, куда человек возвращается из банка. */
    private страницаПлатежа(paymentId: string): string {
        const база = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000')
            .replace(/\/+$/, '');
        return `${база}/billing/payment/${paymentId}`;
    }

    private async сообщитьВладельцу(текст: string) {
        try {
            await this.telegram.send(текст);
        } catch (error) {
            this.logger.warn(`Не удалось сообщить об оплате: ${error}`);
        }
    }
}

/**
 * Столько ли списали, сколько просили.
 *
 * Сравнение числовое, а не строковое: мы отправляем «15000», а в ответе
 * может прийти «15000.00».
 */
function этоНашаСумма(тело: Record<string, string>, ожидаем: number): boolean {
    const пришло = Number(String(тело.pg_amount ?? '').replace(',', '.'));
    return Number.isFinite(пришло) && Math.round(пришло) === ожидаем;
}

/** «1 месяц» / «3 месяца» / «6 месяцев» — текст читает человек. */
export function месяцевСловом(n: number): string {
    const хвост = n % 100;
    const последняя = n % 10;
    if (хвост > 10 && хвост < 20) return `${n} месяцев`;
    if (последняя === 1) return `${n} месяц`;
    if (последняя >= 2 && последняя <= 4) return `${n} месяца`;
    return `${n} месяцев`;
}
