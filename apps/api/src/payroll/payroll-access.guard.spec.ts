import { ForbiddenException } from '@nestjs/common';
import { PayrollViewGuard, canViewPayroll } from './payroll-access.guard';

/**
 * Зарплаты сотрудников открывает администратор компании, а не должность
 * (владелец, 25.10.2026). Раньше раздел видели руководитель и экспедитор
 * по одной роли.
 */
describe('Кто видит зарплаты сотрудников', () => {
    it('администратор компании — всегда', () => {
        expect(canViewPayroll({ role: 'COMPANY_ADMIN', permissions: [] })).toBe(true);
    });

    it('экспедитор без галочки — нет: должность доступа не даёт', () => {
        expect(canViewPayroll({ role: 'FORWARDER', permissions: ['orders', 'accounting'] })).toBe(false);
    });

    it('бухгалтер с галочкой «Зарплата» — да', () => {
        expect(canViewPayroll({ role: 'ACCOUNTANT', permissions: ['accounting', 'payroll'] })).toBe(true);
    });

    it('отказ объясняет, к кому идти', () => {
        const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ user: { role: 'FORWARDER', permissions: [] } }) }) };
        expect(() => new PayrollViewGuard().canActivate(ctx)).toThrow(ForbiddenException);
        expect(() => new PayrollViewGuard().canActivate(ctx)).toThrow(/администратор компании/);
    });
});
