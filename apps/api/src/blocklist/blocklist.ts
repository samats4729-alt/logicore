import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { digitsOnly, normalizePhone, normalizePlate } from '../exchange/driver-identity';

/**
 * Чёрный список компании (задачи шефа, F5/S2).
 *
 * Мошенник в перевозках — это «перевозчик», который берёт груз и
 * пропадает, или заказчик, который не платит. Узнав о таком, логист
 * говорил коллегам на словах, и через месяц другой логист заводил ту же
 * фирму заново. Теперь его БИН, телефон или госномер записываются в
 * список, и система сама не даёт:
 *  - завести такого контрагента, водителя или машину в справочник;
 *  - откликнуться ему на биржевую заявку этой компании.
 *
 * Значения сравниваются приведёнными: «8 701 123-45-67» и «+77011234567» —
 * один телефон, «123 abc 02» и «123ABC02» — один номер.
 */
export const BLOCK_KINDS = ['BIN_IIN', 'PHONE', 'PLATE'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
    BIN_IIN: 'БИН/ИИН',
    PHONE: 'телефон',
    PLATE: 'госномер',
};

/** Значение к одному виду. Пустая строка — сравнивать нечего. */
export function normalizeBlockValue(kind: BlockKind, raw: string | null | undefined): string {
    if (!raw) return '';
    if (kind === 'BIN_IIN') return digitsOnly(raw);
    // Зарубежный номер в казахстанский вид не приводится — сравниваем цифрами.
    if (kind === 'PHONE') return normalizePhone(raw) || digitsOnly(raw);
    return normalizePlate(raw);
}

export interface BlockCandidates {
    /** БИН фирмы или ИИН человека — в Казахстане это одно поле из 12 цифр. */
    binIin?: (string | null | undefined)[];
    phones?: (string | null | undefined)[];
    plates?: (string | null | undefined)[];
}

function keysOf(c: BlockCandidates): { kind: BlockKind; value: string }[] {
    const keys = [
        ...(c.binIin ?? []).map((v) => ({ kind: 'BIN_IIN' as const, value: normalizeBlockValue('BIN_IIN', v) })),
        ...(c.phones ?? []).map((v) => ({ kind: 'PHONE' as const, value: normalizeBlockValue('PHONE', v) })),
        ...(c.plates ?? []).map((v) => ({ kind: 'PLATE' as const, value: normalizeBlockValue('PLATE', v) })),
    ];
    return keys.filter((k) => k.value);
}

/** Первая совпавшая запись чёрного списка компании или `null`. */
export async function findBlock(prisma: PrismaService, companyId: string, candidates: BlockCandidates) {
    const keys = keysOf(candidates);
    if (!keys.length) return null;
    return prisma.companyBlocklist.findFirst({
        where: { companyId, OR: keys },
        select: { kind: true, value: true, name: true, reason: true },
    });
}

/**
 * Не пускает запись из чёрного списка. Сотруднику своей компании говорим
 * прямо, что совпало и почему, — это его же список.
 */
export async function assertNotBlocked(
    prisma: PrismaService,
    companyId: string,
    candidates: BlockCandidates,
): Promise<void> {
    const hit = await findBlock(prisma, companyId, candidates);
    if (!hit) return;
    const who = hit.name ? ` («${hit.name}»)` : '';
    const label = BLOCK_KIND_LABEL[hit.kind as BlockKind] ?? 'значение';
    throw new BadRequestException(
        `${label[0].toUpperCase()}${label.slice(1)} ${hit.value}${who} в чёрном списке вашей компании: ${hit.reason}. `
        + 'Если это ошибка — уберите запись в «Кабинет» → «Чёрный список».',
    );
}
