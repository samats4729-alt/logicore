import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockMoveType } from '@prisma/client';

interface MoveLineInput { nomenclatureId: string; quantity: number; price?: number }
interface MoveInput {
    type: StockMoveType;
    date: string;
    warehouseId: string;
    toWarehouseId?: string;
    counterparty?: string;
    note?: string;
    lines: MoveLineInput[];
}

const round = (v: number) => Math.round((v || 0) * 100) / 100;

@Injectable()
export class InventoryService {
    constructor(private prisma: PrismaService) { }

    // ==================== НОМЕНКЛАТУРА ====================

    getNomenclature(companyId: string) {
        return this.prisma.nomenclatureItem.findMany({
            where: { companyId },
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        });
    }

    async createNomenclature(companyId: string, data: { name: string; unit?: string; sku?: string }) {
        const name = (data.name || '').trim();
        if (!name) throw new BadRequestException('Укажите наименование');
        const existing = await this.prisma.nomenclatureItem.findFirst({ where: { companyId, name } });
        if (existing) {
            if (!existing.isActive) return this.prisma.nomenclatureItem.update({ where: { id: existing.id }, data: { isActive: true } });
            throw new BadRequestException('Позиция с таким наименованием уже существует');
        }
        return this.prisma.nomenclatureItem.create({
            data: { companyId, name, unit: (data.unit || 'шт').trim() || 'шт', sku: data.sku?.trim() || null },
        });
    }

    async updateNomenclature(companyId: string, id: string, data: { name?: string; unit?: string; sku?: string; isActive?: boolean }) {
        const item = await this.prisma.nomenclatureItem.findFirst({ where: { id, companyId } });
        if (!item) throw new NotFoundException('Позиция не найдена');
        return this.prisma.nomenclatureItem.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.unit !== undefined && { unit: data.unit.trim() || 'шт' }),
                ...(data.sku !== undefined && { sku: data.sku.trim() || null }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        });
    }

    // ==================== СКЛАДЫ ====================

    getWarehouses(companyId: string) {
        return this.prisma.stockWarehouse.findMany({
            where: { companyId },
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        });
    }

    async createWarehouse(companyId: string, data: { name: string }) {
        const name = (data.name || '').trim();
        if (!name) throw new BadRequestException('Укажите название склада');
        const existing = await this.prisma.stockWarehouse.findFirst({ where: { companyId, name } });
        if (existing) {
            if (!existing.isActive) return this.prisma.stockWarehouse.update({ where: { id: existing.id }, data: { isActive: true } });
            throw new BadRequestException('Склад с таким названием уже существует');
        }
        return this.prisma.stockWarehouse.create({ data: { companyId, name } });
    }

    async updateWarehouse(companyId: string, id: string, data: { name?: string; isActive?: boolean }) {
        const wh = await this.prisma.stockWarehouse.findFirst({ where: { id, companyId } });
        if (!wh) throw new NotFoundException('Склад не найден');
        return this.prisma.stockWarehouse.update({
            where: { id },
            data: { ...(data.name !== undefined && { name: data.name.trim() }), ...(data.isActive !== undefined && { isActive: data.isActive }) },
        });
    }

    // ==================== ДОКУМЕНТЫ ДВИЖЕНИЯ ====================

    private readonly TYPE_PREFIX: Record<StockMoveType, string> = {
        RECEIPT: 'ПН-', TRANSFER: 'ПМ-', WRITEOFF: 'СП-',
    };

    private async generateMoveNumber(companyId: string, type: StockMoveType): Promise<string> {
        const count = await this.prisma.stockMove.count({ where: { companyId, type } });
        return `${this.TYPE_PREFIX[type]}${String(count + 1).padStart(6, '0')}`;
    }

    getMoves(companyId: string, type: StockMoveType) {
        return this.prisma.stockMove.findMany({
            where: { companyId, type },
            include: {
                warehouse: { select: { name: true } },
                toWarehouse: { select: { name: true } },
                lines: { include: { nomenclature: { select: { name: true, unit: true } } } },
            },
            orderBy: { date: 'desc' },
        });
    }

    // Остатки конкретного склада (для контроля списаний/перемещений), можно исключить документ (при редактировании)
    private async getWarehouseStock(companyId: string, warehouseId: string, excludeMoveId?: string): Promise<Map<string, number>> {
        const moves = await this.prisma.stockMove.findMany({
            where: {
                companyId,
                ...(excludeMoveId && { id: { not: excludeMoveId } }),
                OR: [{ warehouseId }, { toWarehouseId: warehouseId }],
            },
            include: { lines: true },
        });
        const map = new Map<string, number>();
        const bump = (nomId: string, d: number) => map.set(nomId, round((map.get(nomId) || 0) + d));
        for (const m of moves) {
            for (const l of m.lines) {
                if (m.type === StockMoveType.RECEIPT && m.warehouseId === warehouseId) bump(l.nomenclatureId, l.quantity);
                else if (m.type === StockMoveType.WRITEOFF && m.warehouseId === warehouseId) bump(l.nomenclatureId, -l.quantity);
                else if (m.type === StockMoveType.TRANSFER) {
                    if (m.warehouseId === warehouseId) bump(l.nomenclatureId, -l.quantity);
                    if (m.toWarehouseId === warehouseId) bump(l.nomenclatureId, l.quantity);
                }
            }
        }
        return map;
    }

    // Проверка достаточности остатков для списания/перемещения
    private async assertStockAvailable(companyId: string, type: StockMoveType, warehouseId: string, lines: MoveLineInput[], excludeMoveId?: string) {
        if (type !== StockMoveType.WRITEOFF && type !== StockMoveType.TRANSFER) return;
        const stock = await this.getWarehouseStock(companyId, warehouseId, excludeMoveId);
        const requested = new Map<string, number>();
        for (const l of lines) requested.set(l.nomenclatureId, round((requested.get(l.nomenclatureId) || 0) + l.quantity));

        const shortages = Array.from(requested.entries()).filter(([nomId, qty]) => qty > (stock.get(nomId) || 0) + 1e-6);
        if (shortages.length === 0) return;

        const names = await this.prisma.nomenclatureItem.findMany({
            where: { id: { in: shortages.map(([nomId]) => nomId) } },
            select: { id: true, name: true, unit: true },
        });
        const nameMap = new Map(names.map(n => [n.id, n]));
        const msg = shortages.map(([nomId, qty]) => {
            const n = nameMap.get(nomId);
            return `«${n?.name || nomId}»: нужно ${round(qty)}, на складе ${round(stock.get(nomId) || 0)} ${n?.unit || ''}`.trim();
        }).join('; ');
        throw new BadRequestException(`Недостаточно на складе — ${msg}`);
    }

    private validateMove(data: MoveInput) {
        if (!data.warehouseId) throw new BadRequestException('Укажите склад');
        if (data.type === StockMoveType.TRANSFER) {
            if (!data.toWarehouseId) throw new BadRequestException('Укажите склад-получатель');
            if (data.toWarehouseId === data.warehouseId) throw new BadRequestException('Склады отправитель и получатель совпадают');
        }
        const lines = (data.lines || []).filter(l => l.nomenclatureId && l.quantity > 0);
        if (lines.length === 0) throw new BadRequestException('Добавьте хотя бы одну позицию');
        return lines;
    }

    async createMove(companyId: string, userId: string, data: MoveInput) {
        const lines = this.validateMove(data);
        await this.assertStockAvailable(companyId, data.type, data.warehouseId, lines);
        const number = await this.generateMoveNumber(companyId, data.type);
        return this.prisma.stockMove.create({
            data: {
                companyId, type: data.type, number, date: new Date(data.date),
                warehouseId: data.warehouseId,
                toWarehouseId: data.type === StockMoveType.TRANSFER ? data.toWarehouseId : null,
                counterparty: data.counterparty?.trim() || null,
                note: data.note?.trim() || null,
                createdById: userId,
                lines: {
                    create: lines.map(l => ({
                        nomenclatureId: l.nomenclatureId,
                        quantity: round(l.quantity),
                        price: l.price != null ? round(l.price) : null,
                        amount: l.price != null ? round(l.quantity * l.price) : null,
                    })),
                },
            },
            include: { lines: true },
        });
    }

    async updateMove(companyId: string, id: string, data: MoveInput) {
        const move = await this.prisma.stockMove.findFirst({ where: { id, companyId } });
        if (!move) throw new NotFoundException('Документ не найден');
        const lines = this.validateMove({ ...data, type: move.type });
        await this.assertStockAvailable(companyId, move.type, data.warehouseId, lines, id);
        // Перезаписываем строки целиком
        await this.prisma.stockMoveLine.deleteMany({ where: { moveId: id } });
        return this.prisma.stockMove.update({
            where: { id },
            data: {
                date: new Date(data.date),
                warehouseId: data.warehouseId,
                toWarehouseId: move.type === StockMoveType.TRANSFER ? data.toWarehouseId : null,
                counterparty: data.counterparty?.trim() || null,
                note: data.note?.trim() || null,
                lines: {
                    create: lines.map(l => ({
                        nomenclatureId: l.nomenclatureId,
                        quantity: round(l.quantity),
                        price: l.price != null ? round(l.price) : null,
                        amount: l.price != null ? round(l.quantity * l.price) : null,
                    })),
                },
            },
            include: { lines: true },
        });
    }

    async deleteMove(companyId: string, id: string) {
        const move = await this.prisma.stockMove.findFirst({ where: { id, companyId } });
        if (!move) throw new NotFoundException('Документ не найден');
        await this.prisma.stockMove.delete({ where: { id } });
        return { ok: true };
    }

    // ==================== ВЕДОМОСТЬ ПО ОСТАТКАМ ====================

    async getStockBalances(companyId: string, warehouseId?: string) {
        const moves = await this.prisma.stockMove.findMany({
            where: { companyId },
            include: { lines: true },
        });

        // ключ: warehouseId__nomenclatureId → qty
        const balances = new Map<string, { warehouseId: string; nomenclatureId: string; quantity: number }>();
        const bump = (whId: string, nomId: string, delta: number) => {
            const key = `${whId}__${nomId}`;
            const cur = balances.get(key) || { warehouseId: whId, nomenclatureId: nomId, quantity: 0 };
            cur.quantity = round(cur.quantity + delta);
            balances.set(key, cur);
        };

        for (const m of moves) {
            for (const l of m.lines) {
                if (m.type === StockMoveType.RECEIPT) bump(m.warehouseId, l.nomenclatureId, l.quantity);
                else if (m.type === StockMoveType.WRITEOFF) bump(m.warehouseId, l.nomenclatureId, -l.quantity);
                else if (m.type === StockMoveType.TRANSFER) {
                    bump(m.warehouseId, l.nomenclatureId, -l.quantity);
                    if (m.toWarehouseId) bump(m.toWarehouseId, l.nomenclatureId, l.quantity);
                }
            }
        }

        const [warehouses, nomenclature] = await Promise.all([
            this.prisma.stockWarehouse.findMany({ where: { companyId }, select: { id: true, name: true } }),
            this.prisma.nomenclatureItem.findMany({ where: { companyId }, select: { id: true, name: true, unit: true } }),
        ]);
        const whMap = new Map(warehouses.map(w => [w.id, w.name]));
        const nomMap = new Map(nomenclature.map(n => [n.id, n]));

        // Средняя цена по номенклатуре из поступлений (для денежной оценки остатков)
        const recvQty = new Map<string, number>();
        const recvSum = new Map<string, number>();
        for (const m of moves) {
            if (m.type !== StockMoveType.RECEIPT) continue;
            for (const l of m.lines) {
                if (l.amount == null) continue;
                recvQty.set(l.nomenclatureId, (recvQty.get(l.nomenclatureId) || 0) + l.quantity);
                recvSum.set(l.nomenclatureId, (recvSum.get(l.nomenclatureId) || 0) + l.amount);
            }
        }
        const avgCost = (nomId: string) => {
            const q = recvQty.get(nomId) || 0;
            return q > 0 ? (recvSum.get(nomId) || 0) / q : 0;
        };

        const rows = Array.from(balances.values())
            .filter(b => (!warehouseId || b.warehouseId === warehouseId) && Math.abs(b.quantity) > 0.0001)
            .map(b => {
                const cost = avgCost(b.nomenclatureId);
                return {
                    warehouseId: b.warehouseId,
                    warehouse: whMap.get(b.warehouseId) || '—',
                    nomenclatureId: b.nomenclatureId,
                    nomenclature: nomMap.get(b.nomenclatureId)?.name || '—',
                    unit: nomMap.get(b.nomenclatureId)?.unit || '',
                    quantity: b.quantity,
                    avgCost: round(cost),
                    value: round(b.quantity * cost),
                };
            })
            .sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.nomenclature.localeCompare(b.nomenclature));

        const totalValue = round(rows.reduce((s, r) => s + r.value, 0));
        return { rows, warehouses, positions: rows.length, totalValue };
    }
}
