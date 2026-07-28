import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('AuthService.findUserById', () => {
    const baseUser = {
        id: 'user-1',
        email: 'user@example.com',
        isActive: true,
        permissions: ['orders'],
        role: UserRole.LOGISTICIAN,
        companyId: 'primary-company',
    };

    const makeService = (relation: any) => {
        const prisma = {
            user: { findUnique: jest.fn().mockResolvedValue(baseUser) },
            userCompanyRelation: { findUnique: jest.fn().mockResolvedValue(relation) },
        };
        return {
            prisma,
            service: new AuthService(
                prisma as any,
                {} as any,
                {} as any,
                {} as any,
                {} as any,
                {} as any,
                {} as any,
            ),
        };
    };

    it('uses the current database role for the active company', async () => {
        const { service } = makeService({
            role: UserRole.ACCOUNTANT,
            company: { isActive: true },
        });

        await expect(service.findUserById('user-1', 'company-2')).resolves.toMatchObject({
            user: {
                companyId: 'company-2',
                role: UserRole.ACCOUNTANT,
            },
        });
    });

    // Причина отказа называется отдельно: раньше все случаи сливались в null,
    // и человек, только что вошедший под своей почтой, получал на каждый
    // запрос «Пользователь не найден».
    it('revokes a token after the company relation is removed', async () => {
        const { service } = makeService(null);

        await expect(service.findUserById('user-1', 'company-2'))
            .resolves.toEqual({ reason: 'NO_RELATION' });
    });

    it('revokes access when the active company is disabled', async () => {
        const { service } = makeService({
            role: UserRole.LOGISTICIAN,
            company: { isActive: false },
        });

        await expect(service.findUserById('user-1', 'company-2'))
            .resolves.toEqual({ reason: 'COMPANY_OFF' });
    });
});
