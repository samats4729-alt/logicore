import { BadRequestException, Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { CompanyVerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isInvoiceTiming, isPaymentAnchor } from '../common/utils/payment-terms';

@Injectable()
export class ExternalCompaniesService {
    constructor(private prisma: PrismaService) { }

    /**
     * Получить список внешних компаний, созданных текущей компанией.
     * Если в настройках компании включено «менеджеры видят только своих
     * контрагентов», LOGISTICIAN получает лишь контрагентов, где он
     * ответственный менеджер (или ответственный не назначен).
     */
    async getExternalCompanies(companyId: string, userId?: string, role?: string) {
        const where: any = {
            isExternal: true,
            createdByCompanyId: companyId,
        };

        if (role === 'LOGISTICIAN' && userId) {
            const owner = await this.prisma.company.findUnique({
                where: { id: companyId },
                select: { managersSeeOwnPartnersOnly: true },
            });
            if (owner?.managersSeeOwnPartnersOnly) {
                where.OR = [
                    { responsibleManagerId: userId },
                    { responsibleManagerId: null },
                ];
            }
        }

        return this.prisma.company.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                bin: true,
                phone: true,
                email: true,
                type: true,
                isCustomer: true,
                isCarrier: true,
                address: true,
                directorName: true,
                // Как называется у этого заказчика его номер перевозки и
                // печатать ли его в счёте.
                customerRefLabel: true,
                customerRefPrintInvoice: true,
                // Условия расчётов: из них берутся НДС и сроки оплаты в
                // заявке, поэтому нужны в списке, а не только в карточке.
                vatPayer: true,
                vatRate: true,
                invoiceTiming: true,
                customerPaymentDays: true,
                customerPaymentFrom: true,
                carrierPaymentDays: true,
                carrierPaymentFrom: true,
                isActive: true,
                createdAt: true,
                responsibleManagerId: true,
                responsibleManager: { select: { id: true, firstName: true, lastName: true } },
            },
        });
    }

    /**
     * Создать внешнюю компанию
     */
    async createExternalCompany(companyId: string, data: {
        name: string;
        bin?: string;
        phone?: string;
        email?: string;
        type: 'CUSTOMER' | 'FORWARDER';
        isCustomer?: boolean;
        isCarrier?: boolean;
        address?: string;
        directorName?: string;
        customerRefLabel?: string | null;
        customerRefPrintInvoice?: boolean;
    }, creatorUserId?: string) {
        const isCustomer = data.isCustomer !== undefined ? data.isCustomer : (data.type === 'CUSTOMER');
        const isCarrier = data.isCarrier !== undefined ? data.isCarrier : (data.type === 'FORWARDER');
        const bin = data.bin?.trim() || undefined;

        // Один БИН — один контрагент в справочнике.
        //
        // Ту же фирму можно было завести сколько угодно раз: в списке строки
        // выглядят одинаково, различить нельзя, а дальше долг одного клиента
        // расходится по нескольким карточкам, и сверка не сходится.
        if (bin) {
            const existing = await this.prisma.company.findFirst({
                where: { bin, isExternal: true, createdByCompanyId: companyId },
                select: { id: true, name: true },
            });
            if (existing) {
                throw new ConflictException(
                    `Контрагент с БИН ${bin} уже заведён: «${existing.name}». `
                    + 'Откройте его карточку — вторую заводить не нужно.',
                );
            }
        }

        // Контрагент уже работает на платформе — берём его реквизиты в поля,
        // которые не заполнили руками. Так одна и та же фирма выглядит
        // одинаково у всех, кто с ней работает.
        const onPlatform = bin
            ? await this.prisma.company.findFirst({
                where: {
                    bin,
                    isExternal: false,
                    verificationStatus: CompanyVerificationStatus.VERIFIED,
                },
                select: { name: true, address: true, directorName: true, phone: true, email: true },
            })
            : null;

        return this.prisma.company.create({
            data: {
                name: data.name?.trim() || onPlatform?.name || data.name,
                bin,
                phone: data.phone || onPlatform?.phone || null,
                email: data.email || onPlatform?.email || null,
                type: data.type,
                isCustomer,
                isCarrier,
                address: data.address || onPlatform?.address || null,
                directorName: data.directorName || onPlatform?.directorName || null,
                customerRefLabel: data.customerRefLabel?.trim() || null,
                customerRefPrintInvoice: data.customerRefPrintInvoice ?? false,
                isExternal: true,
                isOurCompany: false,
                createdByCompanyId: companyId,
                // Кто вбил контрагента — тот и ответственный по умолчанию (как в УЛ)
                responsibleManagerId: creatorUserId || null,
            },
        });
    }

    /**
     * Обновить внешнюю компанию
     */
    async updateExternalCompany(companyId: string, externalId: string, data: {
        name?: string;
        bin?: string;
        phone?: string;
        email?: string;
        address?: string;
        directorName?: string;
        isCustomer?: boolean;
        isCarrier?: boolean;
        responsibleManagerId?: string | null;
        customerRefLabel?: string | null;
        customerRefPrintInvoice?: boolean;
    }) {
        const company = await this.prisma.company.findUnique({
            where: { id: externalId },
        });
        if (!company) throw new NotFoundException('Компания не найдена');
        if (!company.isExternal || company.createdByCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        // Тот же запрет, что и при заведении: правкой БИН нельзя получить
        // вторую карточку той же фирмы.
        const bin = data.bin?.trim();
        if (bin && bin !== company.bin) {
            const existing = await this.prisma.company.findFirst({
                where: {
                    bin,
                    isExternal: true,
                    createdByCompanyId: companyId,
                    id: { not: externalId },
                },
                select: { name: true },
            });
            if (existing) {
                throw new ConflictException(
                    `Контрагент с БИН ${bin} уже заведён: «${existing.name}».`,
                );
            }
        }

        // Ответственным можно назначить только офисного сотрудника своей компании
        if (data.responsibleManagerId) {
            const target = await this.prisma.user.findFirst({
                where: {
                    id: data.responsibleManagerId,
                    companyId,
                    role: { in: ['COMPANY_ADMIN', 'FORWARDER', 'LOGISTICIAN', 'ACCOUNTANT'] as any },
                },
                select: { id: true },
            });
            if (!target) throw new ForbiddenException('Ответственным может быть только сотрудник вашей компании');
        }

        return this.prisma.company.update({
            where: { id: externalId },
            data,
        });
    }

    /**
     * Условия расчётов с контрагентом — НДС и сроки оплаты.
     *
     * Отдельно от общей правки карточки, потому что это ответы бухгалтера:
     * менеджеру их не показывают, а бухгалтера в общую правку контрагента не
     * пускают (там название, БИН, адреса, ответственный менеджер). Разные
     * люди, разные поля — разные входы.
     *
     * Поля стороны, которой контрагент не является, не сохраняются: у
     * перевозчика нет графы «когда мы выставляем ему счёт», и хранить в ней
     * что-то — значит однажды это напечатать.
     */
    async updateSettlementTerms(companyId: string, externalId: string, data: {
        vatPayer?: boolean | null;
        vatRate?: number | null;
        invoiceTiming?: string | null;
        customerPaymentDays?: number | null;
        customerPaymentFrom?: string | null;
        carrierPaymentDays?: number | null;
        carrierPaymentFrom?: string | null;
    }) {
        const company = await this.prisma.company.findUnique({
            where: { id: externalId },
            select: { id: true, isExternal: true, createdByCompanyId: true, isCustomer: true, isCarrier: true },
        });
        if (!company) throw new NotFoundException('Контрагент не найден');
        if (!company.isExternal || company.createdByCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        const days = (value: number | null | undefined, field: string) => {
            if (value === null || value === undefined) return null;
            if (!Number.isInteger(value) || value < 0 || value > 365) {
                throw new BadRequestException(
                    `${field}: срок оплаты — целое число дней от 0 до 365`,
                );
            }
            return value;
        };
        const anchor = (value: string | null | undefined) => {
            if (!value) return null;
            if (!isPaymentAnchor(value)) {
                throw new BadRequestException('Не понял, от какого дня считать отсрочку');
            }
            return value;
        };
        const rate = (value: number | null | undefined) => {
            if (value === null || value === undefined) return null;
            if (!Number.isFinite(value) || value < 0 || value > 100) {
                throw new BadRequestException('Ставка НДС — от 0 до 100 процентов');
            }
            return value;
        };

        // Срок без точки отсчёта — это те самые «15 дней», из которых
        // непонятно, от чего их считать. Просим оба ответа или ни одного.
        const pair = (d: number | null, a: string | null, side: string) => {
            if (d !== null && a === null) {
                throw new BadRequestException(`${side}: укажите, от какого дня считать отсрочку`);
            }
            return { days: d, from: a };
        };

        const patch: Record<string, unknown> = {};
        if (data.vatPayer !== undefined) patch.vatPayer = data.vatPayer;
        if (data.vatRate !== undefined) patch.vatRate = rate(data.vatRate);
        if (data.invoiceTiming !== undefined) {
            if (data.invoiceTiming && !isInvoiceTiming(data.invoiceTiming)) {
                throw new BadRequestException('Не понял, когда выставлять счёт');
            }
            patch.invoiceTiming = company.isCustomer ? (data.invoiceTiming || null) : null;
        }
        if (data.customerPaymentDays !== undefined || data.customerPaymentFrom !== undefined) {
            const side = pair(
                days(data.customerPaymentDays, 'Заказчик'),
                anchor(data.customerPaymentFrom),
                'Заказчик',
            );
            patch.customerPaymentDays = company.isCustomer ? side.days : null;
            patch.customerPaymentFrom = company.isCustomer ? side.from : null;
        }
        if (data.carrierPaymentDays !== undefined || data.carrierPaymentFrom !== undefined) {
            const side = pair(
                days(data.carrierPaymentDays, 'Перевозчик'),
                anchor(data.carrierPaymentFrom),
                'Перевозчик',
            );
            patch.carrierPaymentDays = company.isCarrier ? side.days : null;
            patch.carrierPaymentFrom = company.isCarrier ? side.from : null;
        }

        return this.prisma.company.update({
            where: { id: externalId },
            data: patch,
            select: {
                id: true, name: true,
                vatPayer: true, vatRate: true, invoiceTiming: true,
                customerPaymentDays: true, customerPaymentFrom: true,
                carrierPaymentDays: true, carrierPaymentFrom: true,
            },
        });
    }

    /**
     * Удалить внешнюю компанию
     */
    async deleteExternalCompany(companyId: string, externalId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: externalId },
        });
        if (!company) throw new NotFoundException('Компания не найдена');
        if (!company.isExternal || company.createdByCompanyId !== companyId) {
            throw new ForbiddenException('Нет доступа');
        }

        return this.prisma.company.delete({
            where: { id: externalId },
        });
    }
}
