import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractProposalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getDefaultContractTemplate } from './contract-template';

/** Кто действует: из `req.user`. */
export interface CollabActor {
    companyId: string;
    userId?: string | null;
}

type Side = 'FORWARDER' | 'CUSTOMER';

const CONTRACT_SELECT = {
    id: true,
    contractNumber: true,
    status: true,
    content: true,
    contentVersion: true,
    customerCompanyId: true,
    forwarderCompanyId: true,
    customerCompany: { select: { id: true, name: true, isExternal: true } },
    forwarderCompany: { select: { id: true, name: true, isExternal: true } },
} satisfies Prisma.ContractSelect;

type ContractRow = Prisma.ContractGetPayload<{ select: typeof CONTRACT_SELECT }>;

/** Тексты сравниваем по содержанию, а не по порядку ключей в JSON. */
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Совместная работа над текстом договора (G6, владелец 25.10.2026).
 *
 * - Каждое изменение текста — версия: кто, когда, откуда (`ContractRevision`).
 * - Любая сторона может предложить правки; вторая — принять или отклонить
 *   с причиной; предложивший — отозвать (`ContractProposal`).
 * - Если вторая сторона работает в LogiCore и договор уже не черновик,
 *   текст напрямую не правится — только предложением: иначе одна сторона
 *   тихо меняла бы согласованный текст другой. С контрагентом из
 *   справочника (кабинета у него нет) — как раньше, правят сами.
 * - Предложение помнит версию, на которой основано. Текст с тех пор
 *   изменился — предложение устаревает и не перетирает чужие правки.
 */
@Injectable()
export class ContractCollabService {
    constructor(private readonly prisma: PrismaService) {}

    private async load(contractId: string, companyId: string) {
        const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, select: CONTRACT_SELECT });
        if (!contract) throw new NotFoundException('Договор не найден');
        const mySide: Side | null = contract.forwarderCompanyId === companyId ? 'FORWARDER'
            : contract.customerCompanyId === companyId ? 'CUSTOMER' : null;
        if (!mySide) throw new ForbiddenException('Нет доступа к этому договору');
        const other = mySide === 'FORWARDER' ? contract.customerCompany : contract.forwarderCompany;
        return { contract, mySide, other, otherOnPlatform: !!other && !other.isExternal };
    }

    /** Можно ли сохранить текст напрямую, без согласования. */
    private directEditAllowed(contract: ContractRow, otherOnPlatform: boolean) {
        return !otherOnPlatform || contract.status === 'DRAFT';
    }

    private async actorName(actor: CollabActor): Promise<string | null> {
        const [user, company] = await Promise.all([
            actor.userId ? this.prisma.user.findUnique({ where: { id: actor.userId }, select: { firstName: true, lastName: true } }) : null,
            this.prisma.company.findUnique({ where: { id: actor.companyId }, select: { name: true } }),
        ]);
        const person = [user?.lastName, user?.firstName].filter(Boolean).join(' ');
        return [person, company?.name].filter(Boolean).join(' · ') || null;
    }

    /**
     * Записать новую версию текста. Первая запись в истории сохраняет и
     * прежний текст (версия «до истории правок») — иначе первую правку не с
     * чем было бы сравнить. Условие по номеру версии — защита от гонки: две
     * стороны, сохраняющие разом, не затрут друг друга молча.
     */
    private async writeVersion(
        tx: Prisma.TransactionClient,
        contract: ContractRow,
        content: unknown,
        meta: { source: 'SAVE' | 'PROPOSAL' | 'RESET'; authorCompanyId: string; authorUserId?: string | null; authorName: string | null; note?: string | null; proposalId?: string | null },
    ): Promise<number> {
        let version = contract.contentVersion;
        if (version === 0) {
            await tx.contractRevision.create({
                data: {
                    contractId: contract.id, version: 1, source: 'INITIAL',
                    content: (contract.content ?? getDefaultContractTemplate()) as Prisma.InputJsonValue,
                    note: 'Текст до начала истории правок',
                },
            });
            version = 1;
        }
        const next = version + 1;
        const { count } = await tx.contract.updateMany({
            where: { id: contract.id, contentVersion: contract.contentVersion },
            data: { content: content as Prisma.InputJsonValue, contentVersion: next },
        });
        if (!count) throw new ConflictException('Текст договора только что изменили — обновите страницу и проверьте правки');
        await tx.contractRevision.create({
            data: {
                contractId: contract.id, version: next, source: meta.source,
                content: content as Prisma.InputJsonValue,
                authorCompanyId: meta.authorCompanyId, authorUserId: meta.authorUserId ?? null,
                authorName: meta.authorName, note: meta.note ?? null, proposalId: meta.proposalId ?? null,
            },
        });
        return next;
    }

    // ==================== состояние ====================

    /** Что видно в блоке «Согласование»: версия, кто где, предложения, история. */
    async state(contractId: string, companyId: string) {
        const { contract, mySide, other, otherOnPlatform } = await this.load(contractId, companyId);
        const [proposals, revisions] = await Promise.all([
            this.prisma.contractProposal.findMany({
                where: { contractId },
                select: {
                    id: true, baseVersion: true, summary: true, status: true, createdAt: true,
                    proposedByCompanyId: true, proposedByName: true, decidedByName: true, decidedAt: true, decisionNote: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            }),
            this.prisma.contractRevision.findMany({
                where: { contractId },
                select: { version: true, source: true, authorName: true, authorCompanyId: true, note: true, createdAt: true },
                orderBy: { version: 'desc' },
                take: 200,
            }),
        ]);
        return {
            version: contract.contentVersion,
            mySide,
            otherSide: other ? { id: other.id, name: other.name, onPlatform: otherOnPlatform } : null,
            directEditAllowed: this.directEditAllowed(contract, otherOnPlatform),
            proposals: proposals.map((p) => ({ ...p, mine: p.proposedByCompanyId === companyId })),
            revisions,
        };
    }

    /** Текст одной версии — для просмотра и сравнения с соседней. */
    async revision(contractId: string, companyId: string, version: number) {
        await this.load(contractId, companyId);
        if (!Number.isInteger(version) || version < 1) throw new NotFoundException('Такой версии нет');
        const row = await this.prisma.contractRevision.findUnique({ where: { contractId_version: { contractId, version } } });
        if (!row) throw new NotFoundException('Такой версии нет');
        const previous = version > 1
            ? await this.prisma.contractRevision.findUnique({ where: { contractId_version: { contractId, version: version - 1 } }, select: { content: true } })
            : null;
        return { ...row, previousContent: previous?.content ?? null };
    }

    /** Предложение целиком: предлагаемый текст и текст, от которого оно считалось. */
    async proposal(contractId: string, companyId: string, proposalId: string) {
        const { contract } = await this.load(contractId, companyId);
        const p = await this.prisma.contractProposal.findFirst({ where: { id: proposalId, contractId } });
        if (!p) throw new NotFoundException('Предложение не найдено');
        const base = p.baseVersion === contract.contentVersion
            ? (contract.content ?? getDefaultContractTemplate())
            : (await this.prisma.contractRevision.findUnique({ where: { contractId_version: { contractId, version: p.baseVersion } }, select: { content: true } }))?.content
                ?? contract.content ?? getDefaultContractTemplate();
        return { ...p, baseContent: base, mine: p.proposedByCompanyId === companyId };
    }

    // ==================== прямая правка (прежний путь) ====================

    /** Сохранить текст напрямую — где согласование не требуется — и записать версию. */
    async saveDirect(contractId: string, actor: CollabActor, content: unknown, source: 'SAVE' | 'RESET' = 'SAVE') {
        const { contract, otherOnPlatform, other } = await this.load(contractId, actor.companyId);
        if (!this.directEditAllowed(contract, otherOnPlatform)) {
            throw new ForbiddenException(
                `Договор согласуется с «${other?.name ?? 'второй стороной'}» в LogiCore — менять текст можно только предложением правок. Нажмите «Предложить правки»: вторая сторона увидит, что изменилось, и примет или отклонит.`,
            );
        }
        if (same(content, contract.content ?? getDefaultContractTemplate())) {
            return { id: contract.id, contractNumber: contract.contractNumber, version: contract.contentVersion };
        }
        const authorName = await this.actorName(actor);
        const version = await this.prisma.$transaction((tx) => this.writeVersion(tx, contract, content, {
            source, authorCompanyId: actor.companyId, authorUserId: actor.userId, authorName,
            note: source === 'RESET' ? 'Текст сброшен к шаблону' : null,
        }));
        return { id: contract.id, contractNumber: contract.contractNumber, version };
    }

    // ==================== предложения ====================

    async propose(contractId: string, actor: CollabActor, content: unknown, summary?: string | null) {
        const { contract, otherOnPlatform } = await this.load(contractId, actor.companyId);
        if (!otherOnPlatform) {
            throw new BadRequestException('Вторая сторона не работает в LogiCore, и предложение ей не дойдёт — сохраните текст сами.');
        }
        if (!Array.isArray(content) || !content.length) throw new BadRequestException('В предложении нет текста договора');
        if (same(content, contract.content ?? getDefaultContractTemplate())) {
            throw new BadRequestException('Текст не изменился — предлагать нечего');
        }
        const text = summary?.trim() || null;
        if (text && text.length > 2000) throw new BadRequestException('Пояснение к правкам — не длиннее 2000 знаков');
        const proposal = await this.prisma.contractProposal.create({
            data: {
                contractId, baseVersion: contract.contentVersion, content: content as Prisma.InputJsonValue, summary: text,
                proposedByCompanyId: actor.companyId, proposedByUserId: actor.userId ?? null, proposedByName: await this.actorName(actor),
            },
            select: { id: true, status: true, baseVersion: true, createdAt: true },
        });
        return proposal;
    }

    private async pending(contractId: string, proposalId: string) {
        const p = await this.prisma.contractProposal.findFirst({ where: { id: proposalId, contractId } });
        if (!p) throw new NotFoundException('Предложение не найдено');
        if (p.status !== ContractProposalStatus.PENDING) throw new BadRequestException('По этому предложению уже есть решение');
        return p;
    }

    /** Принять: вторая сторона, и только если текст с тех пор не менялся. */
    async accept(contractId: string, actor: CollabActor, proposalId: string, note?: string | null) {
        const { contract } = await this.load(contractId, actor.companyId);
        const p = await this.pending(contractId, proposalId);
        if (p.proposedByCompanyId === actor.companyId) throw new ForbiddenException('Свои правки принимает вторая сторона договора');
        if (p.baseVersion !== contract.contentVersion) {
            await this.prisma.contractProposal.update({ where: { id: p.id }, data: { status: ContractProposalStatus.OUTDATED } });
            throw new ConflictException('Текст договора изменился после этого предложения — принять его уже нельзя. Попросите вторую сторону прислать правки заново.');
        }
        const deciderName = await this.actorName(actor);
        const version = await this.prisma.$transaction(async (tx) => {
            const v = await this.writeVersion(tx, contract, p.content, {
                source: 'PROPOSAL', authorCompanyId: p.proposedByCompanyId, authorUserId: p.proposedByUserId, authorName: p.proposedByName,
                note: [p.summary, `Принято: ${deciderName ?? 'вторая сторона'}`].filter(Boolean).join(' · '), proposalId: p.id,
            });
            await tx.contractProposal.update({
                where: { id: p.id },
                data: {
                    status: ContractProposalStatus.ACCEPTED, decidedAt: new Date(), decisionNote: note?.trim() || null,
                    decidedByCompanyId: actor.companyId, decidedByUserId: actor.userId ?? null, decidedByName: deciderName,
                },
            });
            // Остальные ждущие предложения считались от прежнего текста.
            await tx.contractProposal.updateMany({
                where: { contractId, status: ContractProposalStatus.PENDING, id: { not: p.id } },
                data: { status: ContractProposalStatus.OUTDATED },
            });
            return v;
        });
        return { version };
    }

    /** Отклонить: вторая сторона, с причиной — иначе предложивший не поймёт, что править. */
    async reject(contractId: string, actor: CollabActor, proposalId: string, reason: string) {
        await this.load(contractId, actor.companyId);
        const p = await this.pending(contractId, proposalId);
        if (p.proposedByCompanyId === actor.companyId) throw new ForbiddenException('Свои правки можно отозвать, а отклоняет их вторая сторона');
        const why = reason?.trim();
        if (!why) throw new BadRequestException('Напишите, почему отклоняете: вторая сторона поймёт, что поправить');
        await this.prisma.contractProposal.update({
            where: { id: p.id },
            data: {
                status: ContractProposalStatus.REJECTED, decidedAt: new Date(), decisionNote: why.slice(0, 2000),
                decidedByCompanyId: actor.companyId, decidedByUserId: actor.userId ?? null, decidedByName: await this.actorName(actor),
            },
        });
        return { ok: true };
    }

    /** Отозвать своё предложение, пока по нему нет решения. */
    async withdraw(contractId: string, actor: CollabActor, proposalId: string) {
        await this.load(contractId, actor.companyId);
        const p = await this.pending(contractId, proposalId);
        if (p.proposedByCompanyId !== actor.companyId) throw new ForbiddenException('Отозвать может только та сторона, что предложила');
        await this.prisma.contractProposal.update({
            where: { id: p.id },
            data: { status: ContractProposalStatus.WITHDRAWN, decidedAt: new Date(), decidedByCompanyId: actor.companyId, decidedByUserId: actor.userId ?? null },
        });
        return { ok: true };
    }
}
