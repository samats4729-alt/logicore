import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import {
    FinanceCalculatorService,
    ORDER_FINANCE_RELATIONS_SELECT,
    ORDER_FINANCE_SELECT,
    orderFinancePayments,
} from '../accounting/services/finance-calculator.service';
import { toNum } from '../common/utils/money';

/** Столько строк выгружают глазами; больше — это уже вопрос к отчётам. */
const MAX_ROWS = 5000;

const STATUS_RU: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает назначения',
    ASSIGNED: 'Назначен водитель',
    EN_ROUTE_PICKUP: 'В пути на погрузку',
    AT_PICKUP: 'На погрузке',
    LOADING: 'Идёт погрузка',
    IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'Прибыл на выгрузку',
    UNLOADING: 'Идёт разгрузка',
    COMPLETED: 'Завершён',
    CANCELLED: 'Отменён',
    PROBLEM: 'Проблема',
};

const date = (value?: Date | null) =>
    value ? new Date(value).toLocaleDateString('ru-RU') : '';

/**
 * Выгрузка журнала заявок в Excel.
 *
 * Бухгалтер отбирает на экране нужное — заказчика, период, города — и
 * дальше работает в Excel: сводит с выпиской, считает по-своему, шлёт
 * директору. Раньше кнопки не было вовсе, и отобранное переносили руками.
 *
 * Выгружается ровно то, что отобрано: список заявок приходит с экрана
 * поимённо. Повторять здесь клиентские фильтры значило бы завести вторую
 * правду об отборе, и рано или поздно выгрузка разошлась бы с тем, что
 * человек видит.
 *
 * Суммы считает тот же калькулятор, что и карточка заявки: своя формула
 * здесь дала бы третью правду о марже.
 */
@Injectable()
export class OrdersExportService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly calculator: FinanceCalculatorService,
    ) {}

    async exportOrders(companyId: string, orderIds: string[]): Promise<Buffer> {
        const ids = [...new Set(orderIds ?? [])].filter(Boolean);
        if (!ids.length) {
            throw new BadRequestException('Нечего выгружать: в списке нет заявок');
        }
        if (ids.length > MAX_ROWS) {
            throw new BadRequestException(
                `За раз выгружается не больше ${MAX_ROWS} заявок — сузьте отбор`,
            );
        }

        // Чужие заявки в выгрузку не попадают: отбор пришёл из браузера, и
        // доверять ему список нельзя.
        const scope: Prisma.OrderWhereInput = {
            id: { in: ids },
            OR: [
                { customerCompanyId: companyId },
                { forwarderId: companyId },
                { partnerId: companyId },
                { subForwarderId: companyId },
                { responsibleManager: { companyId } },
            ],
        };

        const orders = await this.prisma.order.findMany({
            where: scope,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                completedAt: true,
                cargoDescription: true,
                cargoWeight: true,
                assignedDriverName: true,
                assignedDriverPlate: true,
                customerPaymentDate: true,
                driverPaymentDate: true,
                customerCompany: { select: { name: true } },
                subForwarder: { select: { name: true } },
                partner: { select: { name: true } },
                forwarder: { select: { name: true } },
                driver: { select: { firstName: true, lastName: true, vehiclePlate: true } },
                responsibleManager: { select: { firstName: true, lastName: true } },
                routePoints: {
                    orderBy: { sequence: 'asc' },
                    select: {
                        pointType: true,
                        expectedDate: true,
                        location: { select: { city: true, address: true } },
                    },
                },
                accountingDocuments: {
                    select: { document: { select: { number: true, type: true, status: true } } },
                },
                ...ORDER_FINANCE_SELECT,
                ...ORDER_FINANCE_RELATIONS_SELECT,
            },
        });

        const rows = orders.map((order) => {
            const finance = this.calculator.computeOrderFinance({
                order,
                payments: orderFinancePayments(order),
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            const points = order.routePoints;
            const pickup = points.find((point) => point.pointType === 'PICKUP');
            const deliveries = points.filter((point) => point.pointType === 'DELIVERY');
            const delivery = deliveries.length ? deliveries[deliveries.length - 1] : null;
            const cityOf = (
                point?: { location: { city: string | null; address: string | null } | null } | null,
            ) => point?.location?.city || point?.location?.address || '';

            const carrier = order.subForwarder?.name
                || order.partner?.name
                || order.assignedDriverName
                || (order.driver ? `${order.driver.lastName ?? ''} ${order.driver.firstName ?? ''}`.trim() : '');

            const invoice = order.accountingDocuments
                .map((link) => link.document)
                .find((document) => document?.type === 'PAYMENT_INVOICE' && document.status !== 'CANCELLED');

            return {
                '№ заявки': order.orderNumber,
                'Дата создания': date(order.createdAt),
                'Дата погрузки': date(pickup?.expectedDate),
                'Дата завершения': date(order.completedAt),
                'Статус': STATUS_RU[order.status] || order.status,
                'Заказчик': order.customerCompany?.name || '',
                'Перевозчик': carrier,
                'Водитель': order.assignedDriverName
                    || (order.driver ? `${order.driver.lastName ?? ''} ${order.driver.firstName ?? ''}`.trim() : ''),
                'Транспорт': order.assignedDriverPlate || order.driver?.vehiclePlate || '',
                'Откуда': cityOf(pickup),
                'Куда': cityOf(delivery),
                'Груз': order.cargoDescription || '',
                'Вес, кг': order.cargoWeight ? toNum(order.cargoWeight) : '',
                'Менеджер': order.responsibleManager
                    ? `${order.responsibleManager.lastName ?? ''} ${order.responsibleManager.firstName ?? ''}`.trim()
                    : '',
                // Суммы — в тенге по курсу заявки: складывать доллары с
                // тенге в одной колонке нельзя, а Excel этого не заметит.
                'Ставка заказчика': toNum(finance.revenue),
                'Оплачено заказчиком': toNum(finance.paidIn),
                'Долг заказчика': toNum(finance.customerDebt),
                'Ставка перевозчика': toNum(finance.executorCost),
                'Оплачено перевозчику': toNum(finance.paidOut),
                'Долг перевозчику': toNum(finance.executorDebt),
                'Маржа': toNum(finance.margin),
                'Счёт': invoice?.number || '',
                'Срок оплаты заказчиком': date(order.customerPaymentDate),
                'Срок оплаты перевозчику': date(order.driverPaymentDate),
            };
        });

        const sheet = XLSX.utils.json_to_sheet(rows);

        // Ширина колонок по содержимому: иначе Excel открывается сеткой из
        // «####», и первым делом человек тянет границы мышкой.
        const widths = rows.reduce((acc, row) => {
            Object.keys(row).forEach((key, index) => {
                const value = String((row as any)[key] ?? '');
                acc[index] = Math.max(acc[index] || 10, value.length, key.length);
            });
            return acc;
        }, [] as number[]);
        sheet['!cols'] = widths.map((width) => ({ wch: Math.min(width + 2, 42) }));

        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Заявки');
        return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }
}
