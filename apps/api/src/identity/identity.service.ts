import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ФАЗА 1 мультикомпанийной архитектуры: слой «Личность» (Person).
 *
 * Здесь только аддитивные операции:
 *  - backfillPersons(): создаёт по одной записи Person на каждого User, у которого её ещё нет (1:1),
 *    БЕЗ слияния дубликатов. Идемпотентно и безопасно для повторного запуска.
 *  - getPotentialDuplicates(): только ЧИТАЕТ и показывает возможные дубликаты (совпадение телефона/ИИН),
 *    ничего не объединяя. Решение о слиянии остаётся за человеком.
 *
 * Существующая логика (водители, сотрудники, заявки) этот сервис НЕ трогает.
 */
@Injectable()
export class IdentityService {
    private readonly logger = new Logger(IdentityService.name);

    constructor(private prisma: PrismaService) {}

    /** Нормализуем телефон до цифр (последние 10 — для сравнения без учёта +7/8/пробелов). */
    private normalizePhone(phone?: string | null): string | null {
        if (!phone) return null;
        const digits = phone.replace(/\D/g, '');
        if (!digits) return null;
        return digits.length > 10 ? digits.slice(-10) : digits;
    }

    /**
     * Создать Person для всех пользователей без personId (1:1, без слияния).
     * Возвращает статистику. Можно запускать сколько угодно раз.
     */
    async backfillPersons(): Promise<{ total: number; created: number; alreadyLinked: number }> {
        const users = await this.prisma.user.findMany({
            select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                phone: true,
                iin: true,
                personId: true,
            },
        });

        let created = 0;
        let alreadyLinked = 0;

        for (const u of users) {
            if (u.personId) {
                alreadyLinked++;
                continue;
            }
            // 1:1 — по человеку на каждого пользователя. Слияние НЕ выполняем.
            await this.prisma.$transaction(async (tx) => {
                const person = await tx.person.create({
                    data: {
                        firstName: u.firstName,
                        lastName: u.lastName,
                        middleName: u.middleName ?? null,
                        phone: u.phone ?? null,
                        iin: u.iin ?? null,
                    },
                });
                await tx.user.update({
                    where: { id: u.id },
                    data: { personId: person.id },
                });
            });
            created++;
        }

        this.logger.log(`backfillPersons: total=${users.length}, created=${created}, alreadyLinked=${alreadyLinked}`);
        return { total: users.length, created, alreadyLinked };
    }

    /**
     * Отчёт о возможных дубликатах: пользователи, у которых совпадает нормализованный телефон
     * или ИИН. НИЧЕГО не объединяет — только показывает кандидатов на будущее слияние.
     * Группы, где все пользователи уже указывают на одну и ту же Person, не показываем.
     */
    async getPotentialDuplicates() {
        const users = await this.prisma.user.findMany({
            where: { isActive: true },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                phone: true,
                iin: true,
                role: true,
                personId: true,
                companyId: true,
                company: { select: { name: true } },
            },
        });

        const byPhone = new Map<string, typeof users>();
        const byIin = new Map<string, typeof users>();

        for (const u of users) {
            const p = this.normalizePhone(u.phone);
            if (p) {
                if (!byPhone.has(p)) byPhone.set(p, [] as any);
                byPhone.get(p)!.push(u);
            }
            if (u.iin) {
                if (!byIin.has(u.iin)) byIin.set(u.iin, [] as any);
                byIin.get(u.iin)!.push(u);
            }
        }

        const toUserView = (u: (typeof users)[number]) => ({
            userId: u.id,
            personId: u.personId,
            fullName: `${u.lastName || ''} ${u.firstName || ''} ${u.middleName || ''}`.trim(),
            role: u.role,
            phone: u.phone,
            iin: u.iin,
            companyId: u.companyId,
            companyName: u.company?.name || null,
        });

        // Считаем группу дубликатом, если в ней >1 пользователя и они указывают
        // на РАЗНЫЕ Person (или Person ещё не проставлена).
        const isRealDuplicate = (group: typeof users) => {
            if (group.length < 2) return false;
            const distinctPersonIds = new Set(group.map((u) => u.personId).filter(Boolean));
            // если все уже слиты в одну Person — не показываем
            return !(distinctPersonIds.size === 1 && group.every((u) => u.personId));
        };

        const groups: Array<{
            reason: 'phone' | 'iin';
            key: string;
            users: ReturnType<typeof toUserView>[];
        }> = [];

        for (const [key, group] of byPhone) {
            if (isRealDuplicate(group)) {
                groups.push({ reason: 'phone', key, users: group.map(toUserView) });
            }
        }
        for (const [key, group] of byIin) {
            if (isRealDuplicate(group)) {
                groups.push({ reason: 'iin', key, users: group.map(toUserView) });
            }
        }

        // Сначала группы с водителями и наибольшим числом совпадений
        groups.sort((a, b) => b.users.length - a.users.length);

        return {
            totalGroups: groups.length,
            totalUsersInvolved: new Set(groups.flatMap((g) => g.users.map((u) => u.userId))).size,
            groups,
        };
    }
}
