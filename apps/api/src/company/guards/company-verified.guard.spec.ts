import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyVerificationStatus, UserRole } from '@prisma/client';
import { CompanyVerifiedGuard, REQUIRE_VERIFIED_COMPANY } from './company-verified.guard';
import { CompanyVerificationService } from '../services/company-verification.service';

/**
 * Критерий приёмки T-05: компания в DRAFT/PENDING не создаёт заявки и
 * документы, подтверждение владельца открывает работу.
 *
 * Проверяется на паре «гвард + assertVerified» с подставленной базой: гвард
 * решает, кого спрашивать, сервис — можно ли работать. Интеграционные тесты
 * ходят от подтверждённой компании и на отказ не наткнутся, поэтому запрет
 * нужно закреплять здесь.
 */
describe('CompanyVerifiedGuard', () => {
    // Ручка под гейтом — та, на которой стоит @RequireVerifiedCompany()
    const guardedHandler = function createOrder() {};
    Reflect.defineMetadata(REQUIRE_VERIFIED_COMPANY, true, guardedHandler);
    const openHandler = function listOrders() {};

    const company = (status: CompanyVerificationStatus, rejectionReason: string | null = null) => ({
        findUnique: jest.fn().mockResolvedValue({ verificationStatus: status, rejectionReason }),
    });

    const buildGuard = (companyDelegate: { findUnique: jest.Mock }) => {
        const service = new CompanyVerificationService(
            { company: companyDelegate } as any,
            {} as any,
        );
        return new CompanyVerifiedGuard(new Reflector(), service);
    };

    const context = (user: unknown, gated = true) => ({
        getHandler: () => (gated ? guardedHandler : openHandler),
        getClass: () => class OrdersController {},
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

    it('пропускает подтверждённую компанию', async () => {
        const guard = buildGuard(company(CompanyVerificationStatus.VERIFIED));

        await expect(guard.canActivate(context({ companyId: 'c1', role: UserRole.LOGISTICIAN })))
            .resolves.toBe(true);
    });

    it('не пропускает компанию в черновике', async () => {
        const guard = buildGuard(company(CompanyVerificationStatus.DRAFT));

        await expect(guard.canActivate(context({ companyId: 'c1', role: UserRole.LOGISTICIAN })))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('не пропускает компанию, ожидающую проверки', async () => {
        const guard = buildGuard(company(CompanyVerificationStatus.PENDING));

        await expect(guard.canActivate(context({ companyId: 'c1', role: UserRole.LOGISTICIAN })))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('показывает причину отказа заявителю', async () => {
        const guard = buildGuard(
            company(CompanyVerificationStatus.REJECTED, 'Приказ о назначении нечитаем'),
        );

        await expect(guard.canActivate(context({ companyId: 'c1', role: UserRole.LOGISTICIAN })))
            .rejects.toThrow('Приказ о назначении нечитаем');
    });

    it('не трогает ручки без требования подтверждения', async () => {
        const companyDelegate = company(CompanyVerificationStatus.DRAFT);
        const guard = buildGuard(companyDelegate);

        await expect(
            guard.canActivate(context({ companyId: 'c1', role: UserRole.LOGISTICIAN }, false)),
        ).resolves.toBe(true);
        expect(companyDelegate.findUnique).not.toHaveBeenCalled();
    });

    it('пропускает админа платформы — он и подтверждает компании', async () => {
        const companyDelegate = company(CompanyVerificationStatus.DRAFT);
        const guard = buildGuard(companyDelegate);

        await expect(guard.canActivate(context({ companyId: 'c1', role: UserRole.ADMIN })))
            .resolves.toBe(true);
        expect(companyDelegate.findUnique).not.toHaveBeenCalled();
    });
});
