import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { компанииБазы } from '../common/driver-pool';
import { BLOCK_KINDS, BlockKind, normalizeBlockValue } from './blocklist';

export interface BlockMatch {
    type: 'COUNTERPARTY' | 'DRIVER' | 'VEHICLE';
    id: string;
    name: string;
    href: string;
}

/** Чёрный список компании: просмотр, добавление, снятие (F5/S2). */
@Injectable()
export class BlocklistService {
    constructor(private prisma: PrismaService) { }

    async list(companyId: string) {
        const rows = await this.prisma.companyBlocklist.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' },
        });
        const authorIds = [...new Set(rows.map((r) => r.createdById).filter(Boolean))] as string[];
        const authors = authorIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } })
            : [];
        const nameOf = new Map(authors.map((a) => [a.id, [a.lastName, a.firstName].filter(Boolean).join(' ')]));
        return rows.map((r) => ({ ...r, createdByName: r.createdById ? nameOf.get(r.createdById) ?? null : null }));
    }

    async add(companyId: string, userId: string, dto: { kind: string; value: string; name?: string | null; reason: string }) {
        if (!BLOCK_KINDS.includes(dto.kind as BlockKind)) throw new BadRequestException('Выберите, что заносим: БИН/ИИН, телефон или госномер');
        const kind = dto.kind as BlockKind;
        const value = normalizeBlockValue(kind, dto.value);
        if (kind === 'BIN_IIN' && !/^\d{12}$/.test(value)) throw new BadRequestException('БИН или ИИН — это 12 цифр');
        if (kind === 'PHONE' && value.replace(/\D/g, '').length < 10) throw new BadRequestException('Телефон — не меньше 10 цифр');
        if (kind === 'PLATE' && value.length < 4) throw new BadRequestException('Госномер слишком короткий');
        const reason = dto.reason?.trim();
        if (!reason || reason.length < 3) throw new BadRequestException('Напишите причину — коллегам нужно понимать, за что');

        try {
            const entry = await this.prisma.companyBlocklist.create({
                data: { companyId, kind, value, name: dto.name?.trim() || null, reason, createdById: userId },
            });
            return { entry, matches: await this.matches(companyId, kind, value) };
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('Это значение уже в чёрном списке');
            }
            throw e;
        }
    }

    async remove(companyId: string, id: string) {
        const { count } = await this.prisma.companyBlocklist.deleteMany({ where: { id, companyId } });
        if (!count) throw new NotFoundException('Записи уже нет');
        return { removed: true };
    }

    /**
     * Кто из уже заведённого совпал с новой записью. Список не трогает
     * старые карточки и рейсы — сотрудник должен увидеть их и решить сам.
     */
    async matches(companyId: string, kind: BlockKind, value: string): Promise<BlockMatch[]> {
        const same = (raw: string | null | undefined) => !!raw && normalizeBlockValue(kind, raw) === value;
        const base = await компанииБазы(this.prisma, companyId);
        const result: BlockMatch[] = [];

        if (kind !== 'PLATE') {
            const cards = await this.prisma.company.findMany({
                where: kind === 'BIN_IIN'
                    ? { isExternal: true, createdByCompanyId: companyId, bin: value }
                    : { isExternal: true, createdByCompanyId: companyId, phone: { not: null } },
                select: { id: true, name: true, phone: true, bin: true },
                take: 5000,
            });
            for (const c of cards) {
                if (kind === 'BIN_IIN' || same(c.phone)) {
                    result.push({ type: 'COUNTERPARTY', id: c.id, name: c.name, href: `/company/partners/${c.id}` });
                }
            }
        }

        const drivers = await this.prisma.user.findMany({
            where: {
                role: UserRole.DRIVER,
                isActive: true,
                OR: [{ companyId: { in: [...base.keys()] } }, { baseCompanyId: companyId }],
                ...(kind === 'BIN_IIN' ? { iin: value } : kind === 'PHONE' ? {} : { vehiclePlate: { not: null } }),
            },
            select: { id: true, firstName: true, lastName: true, phone: true, vehiclePlate: true },
            take: 5000,
        });
        for (const d of drivers) {
            const hit = kind === 'BIN_IIN' || (kind === 'PHONE' ? same(d.phone) : same(d.vehiclePlate));
            if (hit) {
                result.push({ type: 'DRIVER', id: d.id, name: [d.lastName, d.firstName].filter(Boolean).join(' '), href: '/company/drivers' });
            }
        }

        if (kind === 'PLATE') {
            const vehicles = await this.prisma.vehicle.findMany({
                where: { companyId, isActive: true },
                select: { id: true, plate: true, model: true },
            });
            for (const v of vehicles) {
                if (same(v.plate)) result.push({ type: 'VEHICLE', id: v.id, name: `${v.plate} · ${v.model}`, href: '/company/vehicles' });
            }
        }
        return result;
    }
}
