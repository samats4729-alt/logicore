import { UserRole } from '@prisma/client';
import { CompanyService } from './company.service';

const ADMIN = 'user-admin';
const EMPLOYEE = 'user-manager';
const OUTSIDER = 'user-outsider';
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const FOREIGN_ORG = 'org-foreign';

/**
 * Связи «человек — организация» как в базе. Фильтрацию Prisma
 * воспроизводим руками: иначе тест проверял бы мок, а не правило.
 */
function makeService(relations: { userId: string; companyId: string; role: UserRole }[]) {
    const rows = [...relations];

    const prisma: any = {
        user: {
            findUnique: jest.fn(async ({ where }: any) => {
                if (where.id === OUTSIDER) {
                    return { id: OUTSIDER, firstName: 'Чужой', lastName: 'Человек', role: UserRole.LOGISTICIAN, companyId: FOREIGN_ORG };
                }
                if (where.id === ADMIN) {
                    return { id: ADMIN, firstName: 'Админ', lastName: 'Компании', role: UserRole.COMPANY_ADMIN, companyId: ORG_A };
                }
                if (where.id === 'user-driver') {
                    return { id: 'user-driver', firstName: 'Водитель', lastName: 'Тестов', role: UserRole.DRIVER, companyId: ORG_A };
                }
                return { id: where.id, firstName: 'Менеджер', lastName: 'Тестов', role: UserRole.LOGISTICIAN, companyId: ORG_A };
            }),
        },
        userCompanyRelation: {
            findMany: jest.fn(async ({ where }: any) => rows.filter((r) => {
                if (where.userId && r.userId !== where.userId) return false;
                if (where.companyId?.in && !where.companyId.in.includes(r.companyId)) return false;
                return true;
            })),
            deleteMany: jest.fn(async ({ where }: any) => {
                const before = rows.length;
                for (let i = rows.length - 1; i >= 0; i -= 1) {
                    const row = rows[i];
                    if (row.userId === where.userId && where.companyId.in.includes(row.companyId)) rows.splice(i, 1);
                }
                return { count: before - rows.length };
            }),
            upsert: jest.fn(async ({ where, create, update }: any) => {
                const existing = rows.find((r) => r.userId === where.userId_companyId.userId
                    && r.companyId === where.userId_companyId.companyId);
                if (existing) existing.role = update.role;
                else rows.push({ ...create });
                return existing ?? create;
            }),
        },
        company: {
            findMany: jest.fn(async ({ where }: any) => [
                { id: ORG_A, name: 'ТОО «Альфа»', bin: '100000000001' },
                { id: ORG_B, name: 'ТОО «Бета»', bin: '100000000002' },
                { id: FOREIGN_ORG, name: 'ТОО «Чужая»', bin: '100000000003' },
            ].filter((c) => where.id.in.includes(c.id))),
        },
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    const identity: any = { syncMembership: jest.fn().mockResolvedValue(undefined) };
    const service = new CompanyService(prisma, {} as any, {} as any, {} as any, {} as any, identity);
    return { service, prisma, rows, identity };
}

/** Админ работает в двух организациях холдинга, менеджер — только в одной. */
const baseRelations = () => [
    { userId: ADMIN, companyId: ORG_A, role: UserRole.COMPANY_ADMIN },
    { userId: ADMIN, companyId: ORG_B, role: UserRole.COMPANY_ADMIN },
    { userId: EMPLOYEE, companyId: ORG_A, role: UserRole.LOGISTICIAN },
];

describe('Доступ сотрудника к организациям холдинга (A-01)', () => {
    describe('просмотр', () => {
        it('показывает все организации админа и отмечает, где сотрудник работает', async () => {
            const { service } = makeService(baseRelations());

            const access = await service.getEmployeeAccess(ADMIN, EMPLOYEE);

            expect(access.companies).toHaveLength(2);
            expect(access.companies.find((c) => c.id === ORG_A)).toMatchObject({
                hasAccess: true,
                role: UserRole.LOGISTICIAN,
            });
            expect(access.companies.find((c) => c.id === ORG_B)).toMatchObject({
                hasAccess: false,
                role: null,
            });
        });

        it('не показывает чужого сотрудника', async () => {
            const { service } = makeService([
                ...baseRelations(),
                { userId: OUTSIDER, companyId: FOREIGN_ORG, role: UserRole.LOGISTICIAN },
            ]);

            // Иначе по этой ручке можно было бы перебирать людей всей платформы.
            await expect(service.getEmployeeAccess(ADMIN, OUTSIDER))
                .rejects.toThrow('не работает в ваших организациях');
        });

        it('водителя помечает как нерасшариваемого', async () => {
            const { service } = makeService([
                ...baseRelations(),
                { userId: 'user-driver', companyId: ORG_A, role: UserRole.DRIVER },
            ]);

            const access = await service.getEmployeeAccess(ADMIN, 'user-driver');

            // Водитель привязан к своему перевозчику, а не к юрлицам холдинга.
            expect(access.user.canShare).toBe(false);
        });
    });

    describe('выдача и отзыв', () => {
        it('выдаёт доступ во вторую организацию', async () => {
            const { service, rows } = makeService(baseRelations());

            await service.setEmployeeAccess(ADMIN, EMPLOYEE, [
                { companyId: ORG_A, role: UserRole.LOGISTICIAN },
                { companyId: ORG_B, role: UserRole.LOGISTICIAN },
            ]);

            expect(rows.filter((r) => r.userId === EMPLOYEE)).toHaveLength(2);
        });

        it('отзывает доступ у того, кого нет в списке', async () => {
            const { service, rows } = makeService([
                ...baseRelations(),
                { userId: EMPLOYEE, companyId: ORG_B, role: UserRole.LOGISTICIAN },
            ]);

            await service.setEmployeeAccess(ADMIN, EMPLOYEE, [
                { companyId: ORG_A, role: UserRole.LOGISTICIAN },
            ]);

            const left = rows.filter((r) => r.userId === EMPLOYEE);
            expect(left).toHaveLength(1);
            expect(left[0].companyId).toBe(ORG_A);
        });

        it('роль может отличаться в разных организациях', async () => {
            const { service, rows } = makeService(baseRelations());

            // Один человек — бухгалтер в одном юрлице и логист в другом.
            await service.setEmployeeAccess(ADMIN, EMPLOYEE, [
                { companyId: ORG_A, role: UserRole.ACCOUNTANT },
                { companyId: ORG_B, role: UserRole.LOGISTICIAN },
            ]);

            const byCompany = new Map(rows.filter((r) => r.userId === EMPLOYEE).map((r) => [r.companyId, r.role]));
            expect(byCompany.get(ORG_A)).toBe(UserRole.ACCOUNTANT);
            expect(byCompany.get(ORG_B)).toBe(UserRole.LOGISTICIAN);
        });
    });

    describe('чего делать нельзя', () => {
        it('нельзя выдать доступ к чужой организации', async () => {
            const { service } = makeService(baseRelations());

            await expect(service.setEmployeeAccess(ADMIN, EMPLOYEE, [
                { companyId: FOREIGN_ORG, role: UserRole.LOGISTICIAN },
            ])).rejects.toThrow('в которой вы не состоите');
        });

        it('нельзя выдать роль администратора платформы', async () => {
            const { service } = makeService(baseRelations());

            await expect(service.setEmployeeAccess(ADMIN, EMPLOYEE, [
                { companyId: ORG_A, role: UserRole.ADMIN },
            ])).rejects.toThrow('Недопустимая роль');
        });

        it('нельзя запереть самого себя, убрав все свои организации', async () => {
            const { service } = makeService(baseRelations());

            await expect(service.setEmployeeAccess(ADMIN, ADMIN, []))
                .rejects.toThrow('Нельзя убрать себе доступ');
        });

        it('водителю доступ к организациям не выдаётся', async () => {
            const { service } = makeService([
                ...baseRelations(),
                { userId: 'user-driver', companyId: ORG_A, role: UserRole.DRIVER },
            ]);

            await expect(service.setEmployeeAccess(ADMIN, 'user-driver', [
                { companyId: ORG_A, role: UserRole.DRIVER },
                { companyId: ORG_B, role: UserRole.DRIVER },
            ])).rejects.toThrow('Водителю доступ');
        });

        it('чужого сотрудника нельзя записать в свою организацию', async () => {
            const { service } = makeService([
                ...baseRelations(),
                { userId: OUTSIDER, companyId: FOREIGN_ORG, role: UserRole.LOGISTICIAN },
            ]);

            await expect(service.setEmployeeAccess(ADMIN, OUTSIDER, [
                { companyId: ORG_A, role: UserRole.LOGISTICIAN },
            ])).rejects.toThrow('не работает в ваших организациях');
        });

        it('отзыв не трогает организации за пределами холдинга', async () => {
            // У сотрудника есть доступ в чужую организацию (например, он
            // работает и на другую компанию). Наш админ его отозвать не может.
            const { service, rows } = makeService([
                ...baseRelations(),
                { userId: EMPLOYEE, companyId: FOREIGN_ORG, role: UserRole.LOGISTICIAN },
            ]);

            await service.setEmployeeAccess(ADMIN, EMPLOYEE, [
                { companyId: ORG_A, role: UserRole.LOGISTICIAN },
            ]);

            expect(rows.some((r) => r.userId === EMPLOYEE && r.companyId === FOREIGN_ORG)).toBe(true);
        });
    });
});
