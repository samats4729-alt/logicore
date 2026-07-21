import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { AffiliationType } from '@prisma/client';
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

    /**
     * Ручное слияние личностей (только по явному подтверждению админа) — ОБРАТИМОЕ.
     * Пользователи, указывавшие на sourcePersonIds, перецепляются на targetPersonId.
     * Исходные Person НЕ удаляются, а помечаются mergedIntoId=target; в журнал
     * (PersonMerge/PersonMergeItem) пишется, кого и откуда перецепили — чтобы можно было
     * полностью откатить. Затрагивается только User.personId — прочие данные не меняются.
     */
    async mergePersons(targetPersonId: string, sourcePersonIds: string[], actorUserId?: string) {
        const sources = (sourcePersonIds || []).filter((id) => id && id !== targetPersonId);
        if (!targetPersonId) {
            throw new BadRequestException('Не указана основная личность (target)');
        }
        if (sources.length === 0) {
            throw new BadRequestException('Не выбрано ни одной личности для присоединения');
        }

        const ids = [targetPersonId, ...sources];
        const found = await this.prisma.person.findMany({
            where: { id: { in: ids } },
            select: { id: true },
        });
        const foundIds = new Set(found.map((p) => p.id));
        if (!foundIds.has(targetPersonId)) {
            throw new NotFoundException('Основная личность не найдена');
        }
        const missing = sources.filter((id) => !foundIds.has(id));
        if (missing.length) {
            throw new NotFoundException(`Личности не найдены: ${missing.join(', ')}`);
        }

        // Пользователи, которых перецепим, и их прежние личности — для журнала/отката
        const affectedUsers = await this.prisma.user.findMany({
            where: { personId: { in: sources } },
            select: { id: true, personId: true },
        });

        const result = await this.prisma.$transaction(async (tx) => {
            const merge = await tx.personMerge.create({
                data: {
                    targetPersonId,
                    createdById: actorUserId ?? null,
                    status: 'ACTIVE',
                    items: {
                        create: affectedUsers.map((u) => ({
                            userId: u.id,
                            previousPersonId: u.personId as string,
                        })),
                    },
                },
            });

            const repointed = await tx.user.updateMany({
                where: { personId: { in: sources } },
                data: { personId: targetPersonId },
            });

            // Помечаем исходные личности как слитые (не удаляем — нужно для отката)
            await tx.person.updateMany({
                where: { id: { in: sources } },
                data: { mergedIntoId: targetPersonId },
            });

            return { mergeId: merge.id, repointedUsers: repointed.count };
        });

        this.logger.log(
            `mergePersons: merge=${result.mergeId}, target=${targetPersonId}, sources=[${sources.join(',')}], repointed=${result.repointedUsers}`,
        );
        return { targetPersonId, mergedPersons: sources.length, ...result };
    }

    /**
     * Полный откат объединения: возвращает пользователей на прежние личности,
     * снимает пометку «слита» с исходных, помечает журнал как REVERTED.
     */
    async revertMerge(mergeId: string) {
        const merge = await this.prisma.personMerge.findUnique({
            where: { id: mergeId },
            include: { items: true },
        });
        if (!merge) {
            throw new NotFoundException('Запись об объединении не найдена');
        }
        if (merge.status !== 'ACTIVE') {
            throw new BadRequestException('Это объединение уже отменено');
        }

        const distinctSourceIds = Array.from(new Set(merge.items.map((it) => it.previousPersonId)));

        const result = await this.prisma.$transaction(async (tx) => {
            let restored = 0;
            for (const it of merge.items) {
                await tx.user.update({
                    where: { id: it.userId },
                    data: { personId: it.previousPersonId },
                });
                restored++;
            }
            // Снимаем пометку «слита» с восстановленных исходных личностей
            await tx.person.updateMany({
                where: { id: { in: distinctSourceIds } },
                data: { mergedIntoId: null },
            });
            await tx.personMerge.update({
                where: { id: mergeId },
                data: { status: 'REVERTED', revertedAt: new Date() },
            });
            return { restoredUsers: restored, restoredPersons: distinctSourceIds.length };
        });

        this.logger.log(`revertMerge: merge=${mergeId}, restoredUsers=${result.restoredUsers}, restoredPersons=${result.restoredPersons}`);
        return { mergeId, ...result };
    }

    // ==================== ФАЗА 2: членство (Affiliation) ====================

    /**
     * Заполнить Affiliation из существующих данных (User.companyId + UserCompanyRelation),
     * не меняя их. Идемпотентно (createMany skipDuplicates). Тип по умолчанию EMPLOYEE —
     * распознавание частных перевозчиков сделаем отдельным шагом. Существующая логика
     * эту таблицу пока не читает.
     */
    async backfillAffiliations() {
        const [users, relations] = await Promise.all([
            this.prisma.user.findMany({
                where: { isActive: true },
                select: { id: true, personId: true, companyId: true, role: true, position: true, departmentId: true },
            }),
            this.prisma.userCompanyRelation.findMany({
                select: { userId: true, companyId: true, role: true },
            }),
        ]);

        const personByUser = new Map(users.map((u) => [u.id, u.personId]));
        let skippedUsersWithoutPerson = 0;

        // Дедуп в памяти по (personId, companyId, role); домашняя связь = isPrimary
        const map = new Map<string, any>();
        const put = (
            personId: string | null,
            companyId: string | null,
            role: any,
            extra: { isPrimary?: boolean; position?: string | null; departmentId?: string | null; sourceUserId?: string | null },
        ) => {
            if (!personId || !companyId || !role) return;
            const key = `${personId}|${companyId}|${role}`;
            const cur = map.get(key);
            if (!cur) {
                map.set(key, {
                    personId,
                    companyId,
                    role,
                    type: AffiliationType.EMPLOYEE,
                    isPrimary: !!extra.isPrimary,
                    position: extra.position ?? null,
                    departmentId: extra.departmentId ?? null,
                    sourceUserId: extra.sourceUserId ?? null,
                    status: 'ACTIVE',
                });
            } else {
                if (extra.isPrimary) cur.isPrimary = true;
                if (!cur.position && extra.position) cur.position = extra.position;
                if (!cur.departmentId && extra.departmentId) cur.departmentId = extra.departmentId;
            }
        };

        for (const u of users) {
            if (!u.personId) {
                skippedUsersWithoutPerson++;
                continue;
            }
            put(u.personId, u.companyId, u.role, {
                isPrimary: true,
                position: u.position,
                departmentId: u.departmentId,
                sourceUserId: u.id,
            });
        }
        for (const r of relations) {
            const pid = personByUser.get(r.userId);
            if (!pid) continue;
            put(pid, r.companyId, r.role, { isPrimary: false, sourceUserId: r.userId });
        }

        const rows = [...map.values()];
        const res = await this.prisma.affiliation.createMany({ data: rows, skipDuplicates: true });

        this.logger.log(`backfillAffiliations: desired=${rows.length}, created=${res.count}, skippedNoPerson=${skippedUsersWithoutPerson}`);
        return { desired: rows.length, created: res.count, skippedUsersWithoutPerson };
    }

    /**
     * Обзор членства: сколько связей, и главное — люди, работающие в НЕСКОЛЬКИХ компаниях
     * (наглядно показывает, что один человек = одна личность в разных компаниях, без дублей).
     */
    async getAffiliationOverview() {
        const affs = await this.prisma.affiliation.findMany({
            select: {
                personId: true,
                companyId: true,
                role: true,
                type: true,
                isPrimary: true,
                person: { select: { firstName: true, lastName: true } },
                company: { select: { name: true } },
            },
        });

        const byPerson = new Map<
            string,
            { fullName: string; companies: Map<string, { name: string; roles: Set<string> }> }
        >();

        for (const a of affs) {
            let p = byPerson.get(a.personId);
            if (!p) {
                p = {
                    fullName: `${a.person?.lastName || ''} ${a.person?.firstName || ''}`.trim(),
                    companies: new Map(),
                };
                byPerson.set(a.personId, p);
            }
            let c = p.companies.get(a.companyId);
            if (!c) {
                c = { name: a.company?.name || '—', roles: new Set() };
                p.companies.set(a.companyId, c);
            }
            c.roles.add(a.role);
        }

        const multiCompanyPersons = [...byPerson.entries()]
            .filter(([, p]) => p.companies.size > 1)
            .map(([personId, p]) => ({
                personId,
                fullName: p.fullName,
                companyCount: p.companies.size,
                companies: [...p.companies.values()].map((c) => ({ name: c.name, roles: [...c.roles] })),
            }))
            .sort((a, b) => b.companyCount - a.companyCount);

        return {
            totalAffiliations: affs.length,
            totalPersons: byPerson.size,
            multiCompanyCount: multiCompanyPersons.length,
            multiCompanyPersons,
        };
    }

    /**
     * История активных объединений (для кнопки «Разъединить»).
     */
    async getMergeHistory() {
        const merges = await this.prisma.personMerge.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            include: { items: true },
        });

        const targetIds = merges.map((m) => m.targetPersonId);
        const userIds = merges.flatMap((m) => m.items.map((it) => it.userId));

        const [targets, users] = await Promise.all([
            this.prisma.person.findMany({ where: { id: { in: targetIds } }, select: { id: true, firstName: true, lastName: true } }),
            this.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, firstName: true, lastName: true, company: { select: { name: true } } },
            }),
        ]);
        const targetById = new Map(targets.map((p) => [p.id, p]));
        const userById = new Map(users.map((u) => [u.id, u]));

        return merges.map((m) => {
            const t = targetById.get(m.targetPersonId);
            return {
                mergeId: m.id,
                createdAt: m.createdAt,
                targetName: t ? `${t.lastName || ''} ${t.firstName || ''}`.trim() : '—',
                mergedCount: m.items.length,
                users: m.items.map((it) => {
                    const u = userById.get(it.userId);
                    return {
                        userId: it.userId,
                        fullName: u ? `${u.lastName || ''} ${u.firstName || ''}`.trim() : it.userId,
                        companyName: u?.company?.name || null,
                    };
                }),
            };
        });
    }
}
