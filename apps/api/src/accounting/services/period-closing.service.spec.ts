import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PeriodClosingService } from './period-closing.service';

describe('PeriodClosingService company roles', () => {
    const makeService = (globalRole: UserRole, companyRole: UserRole | null) => {
        const prisma = {
            user: {
                findUnique: jest.fn().mockResolvedValue({ role: globalRole }),
            },
            userCompanyRelation: {
                findUnique: jest.fn().mockResolvedValue(
                    companyRole ? { role: companyRole } : null,
                ),
            },
            closedPeriod: {
                create: jest.fn().mockResolvedValue({ id: 'period-1' }),
                findUnique: jest.fn().mockResolvedValue({ id: 'period-1' }),
                delete: jest.fn().mockResolvedValue({ id: 'period-1' }),
            },
        };

        return {
            prisma,
            service: new PeriodClosingService(prisma as any),
        };
    };

    it('allows an accountant of the selected company even if the global role differs', async () => {
        const { prisma, service } = makeService(UserRole.LOGISTICIAN, UserRole.ACCOUNTANT);

        await expect(service.closePeriod('company-2', 'user-1', 2026, 7)).resolves.toEqual({
            id: 'period-1',
        });
        expect(prisma.closedPeriod.create).toHaveBeenCalled();
    });

    it('denies a user whose selected-company role is not financial', async () => {
        const { prisma, service } = makeService(UserRole.ACCOUNTANT, UserRole.LOGISTICIAN);

        await expect(service.closePeriod('company-2', 'user-1', 2026, 7)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(prisma.closedPeriod.create).not.toHaveBeenCalled();
    });

    it('allows a platform administrator without a company relation', async () => {
        const { prisma, service } = makeService(UserRole.ADMIN, null);

        await expect(service.openPeriod('company-2', 'admin-1', 2026, 7)).resolves.toEqual({
            success: true,
        });
        expect(prisma.userCompanyRelation.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an invalid month before changing data', async () => {
        const { prisma, service } = makeService(UserRole.ADMIN, null);

        await expect(service.openPeriod('company-2', 'admin-1', 2026, 13)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(prisma.closedPeriod.delete).not.toHaveBeenCalled();
    });
});
