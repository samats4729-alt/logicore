import { UserRole } from '@prisma/client';
import { resolveJournalCompany } from './journal-company';

/**
 * Какую организацию холдинга показывает журнал.
 *
 * Правило вынесено одним местом: по нему отбирается список документов и по
 * нему же считаются итоги над списком. Разъедься они — журнал показывал бы
 * одну организацию, а суммы над ним другую, и заметить это нельзя: обе
 * цифры выглядят правдоподобно.
 */

const Я = 'user-1';
const АКТИВНАЯ = 'org-1';
const ВТОРАЯ = 'org-2';
const ЧУЖАЯ = 'org-чужая';
const БУХГАЛТЕРСКИЕ = [UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.FORWARDER];

function prisma(связи: Record<string, UserRole>) {
    return {
        userCompanyRelation: {
            findUnique: jest.fn(async ({ where }: any) => {
                const роль = связи[where.userId_companyId.companyId];
                return роль ? { role: роль } : null;
            }),
        },
    };
}

describe('Организация журнала', () => {
    it('без выбора берётся активная организация сессии', async () => {
        const db = prisma({});
        const итог = await resolveJournalCompany(db, {
            userId: Я, activeCompanyId: АКТИВНАЯ, allowedRoles: БУХГАЛТЕРСКИЕ,
        });

        expect(итог).toBe(АКТИВНАЯ);
        // За своей же организацией в базу не ходим: право на неё уже есть.
        expect(db.userCompanyRelation.findUnique).not.toHaveBeenCalled();
    });

    it('своя вторая организация открывается', async () => {
        const db = prisma({ [ВТОРАЯ]: UserRole.ACCOUNTANT });
        const итог = await resolveJournalCompany(db, {
            userId: Я, activeCompanyId: АКТИВНАЯ, requestedCompanyId: ВТОРАЯ,
            allowedRoles: БУХГАЛТЕРСКИЕ,
        });

        expect(итог).toBe(ВТОРАЯ);
    });

    it('чужую организацию открыть нельзя', async () => {
        // Название организации приходит из браузера: без проверки это был бы
        // способ читать чужую бухгалтерию.
        const db = prisma({});
        await expect(resolveJournalCompany(db, {
            userId: Я, activeCompanyId: АКТИВНАЯ, requestedCompanyId: ЧУЖАЯ,
            allowedRoles: БУХГАЛТЕРСКИЕ,
        })).rejects.toThrow('Вы не состоите в этой организации');
    });

    it('роль проверяется в выбранной организации, а не общая', async () => {
        // В холдинге роль своя у каждой организации: бухгалтер в одной может
        // быть водителем в другой, и бухгалтерию второй ему видеть нечего.
        const db = prisma({ [ВТОРАЯ]: UserRole.DRIVER });
        await expect(resolveJournalCompany(db, {
            userId: Я, activeCompanyId: АКТИВНАЯ, requestedCompanyId: ВТОРАЯ,
            allowedRoles: БУХГАЛТЕРСКИЕ,
        })).rejects.toThrow('нет доступа к бухгалтерии');
    });

    it('без активной организации журнал не открывается', async () => {
        const db = prisma({});
        await expect(resolveJournalCompany(db, {
            userId: Я, activeCompanyId: null, allowedRoles: БУХГАЛТЕРСКИЕ,
        })).rejects.toThrow('Организация не выбрана');
    });
});
