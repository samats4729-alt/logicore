import { readFileSync } from 'fs';
import { join } from 'path';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';

import { AccountingDocumentsController } from '../accounting-documents/accounting-documents.controller';
import { PaymentProofController } from '../payment-proofs/payment-proof.controller';
import { DocumentsController } from '../documents/documents.controller';
import { OrdersController } from '../orders/orders.controller';
import { WarehouseController } from '../warehouse/warehouse.controller';
import { CompanyController } from '../company/company.controller';

/**
 * Матрица доступов: кто до какого действия допущен.
 *
 * Проверка идёт против НАСТОЯЩИХ `RolesGuard` и `PermissionsGuard` и их
 * метаданных на контроллерах — то есть против того, что реально защищает
 * приложение. Меняется декоратор доступа — падает этот тест, и решение
 * приходится принимать осознанно, а не задним числом.
 *
 * Почему это важно именно здесь: `PermissionsGuard` управляет только тремя
 * офисными ролями (логист, бухгалтер, завсклад). Остальные шесть ролей его
 * проходят насквозь, и их держит только `@Roles`. Систематической проверки
 * «кто что видит» до этой таблицы не было.
 */

const ALL_ROLES: UserRole[] = [
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.LOGISTICIAN,
    UserRole.WAREHOUSE_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.DRIVER,
    UserRole.RECIPIENT,
    UserRole.PARTNER,
    UserRole.FORWARDER,
];

/** Права разделов, которые выдаются офисным ролям в «Сотрудниках». */
const ALL_PERMISSIONS = ['orders', 'documents', 'accounting', 'partners', 'tracking', 'drivers'];

const reflector = new Reflector();
const rolesGuard = new RolesGuard(reflector);
const permissionsGuard = new PermissionsGuard(reflector);

function contextFor(controller: any, method: string, user: any) {
    return {
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
        getHandler: () => controller.prototype[method],
        getClass: () => controller,
    } as any;
}

/** Пропускают ли guard'ы этого пользователя к действию. */
function allowed(controller: any, method: string, role: UserRole, permissions = ALL_PERMISSIONS) {
    const ctx = contextFor(controller, method, { role, permissions, sub: 'u-1', companyId: 'c-1' });
    try {
        return rolesGuard.canActivate(ctx) && permissionsGuard.canActivate(ctx);
    } catch (e) {
        if (e instanceof ForbiddenException) return false;
        throw e;
    }
}

/** Кто реально проходит к действию — список ролей, для наглядного сравнения. */
function whoCanReach(controller: any, method: string, permissions = ALL_PERMISSIONS) {
    return ALL_ROLES.filter((role) => allowed(controller, method, role, permissions));
}

describe('Матрица доступов', () => {
    describe('бухгалтерские документы', () => {
        it('счета и акты создают только администрация и бухгалтерия', () => {
            expect(whoCanReach(AccountingDocumentsController, 'create').sort()).toEqual(
                [UserRole.ACCOUNTANT, UserRole.ADMIN, UserRole.COMPANY_ADMIN].sort(),
            );
        });

        it('проведение документа — тот же круг, что и создание', () => {
            // Проведение создаёт обязательство, поэтому доступ не шире.
            expect(whoCanReach(AccountingDocumentsController, 'postDocument').sort()).toEqual(
                whoCanReach(AccountingDocumentsController, 'create').sort(),
            );
        });

        it('смотреть документы могут ещё логист и экспедитор, но не водитель', () => {
            const viewers = whoCanReach(AccountingDocumentsController, 'getById');
            expect(viewers).toContain(UserRole.LOGISTICIAN);
            expect(viewers).toContain(UserRole.FORWARDER);
            expect(viewers).not.toContain(UserRole.DRIVER);
            expect(viewers).not.toContain(UserRole.RECIPIENT);
            expect(viewers).not.toContain(UserRole.PARTNER);
        });
    });

    describe('чеки от контрагентов', () => {
        it('решение по чеку принимает только бухгалтерия', () => {
            // Подтверждение чека — заявление о подлинности документа,
            // логист такого делать не должен.
            for (const method of ['accept', 'reject']) {
                expect(whoCanReach(PaymentProofController, method).sort()).toEqual(
                    [UserRole.ACCOUNTANT, UserRole.ADMIN, UserRole.COMPANY_ADMIN].sort(),
                );
            }
        });

        it('видеть очередь чеков может и логист — ему нужен статус по рейсу', () => {
            expect(whoCanReach(PaymentProofController, 'list')).toContain(UserRole.LOGISTICIAN);
        });

        it('водитель и грузополучатель к чекам не допущены вовсе', () => {
            for (const method of ['list', 'accept', 'reject', 'file']) {
                const who = whoCanReach(PaymentProofController, method);
                expect(who).not.toContain(UserRole.DRIVER);
                expect(who).not.toContain(UserRole.RECIPIENT);
            }
        });
    });

    describe('права разделов у офисных ролей', () => {
        it('бухгалтер без права «accounting» до документов не доходит', () => {
            expect(allowed(AccountingDocumentsController, 'create', UserRole.ACCOUNTANT, ['orders']))
                .toBe(false);
        });

        it('логист без права «orders» не доходит до заявок', () => {
            expect(allowed(OrdersController, 'findAll', UserRole.LOGISTICIAN, ['accounting']))
                .toBe(false);
        });

        it('логист с правом «orders» до заявок доходит', () => {
            expect(allowed(OrdersController, 'findAll', UserRole.LOGISTICIAN, ['orders']))
                .toBe(true);
        });

        it('администратора компании права разделов не ограничивают', () => {
            // Он их сам и выдаёт — иначе мог бы запереть себя.
            expect(allowed(AccountingDocumentsController, 'create', UserRole.COMPANY_ADMIN, []))
                .toBe(true);
        });
    });

    describe('бухгалтер и заявки', () => {
        it('бухгалтер видит список заявок — иначе он не разнесёт расходы', () => {
            // Экраны расходов, операций и кассы запрашивают `/orders`, чтобы
            // дать выбрать заявку. Пока сюда не пускали, обязательное поле
            // «Заявка» было пустым и расход «по заявке» не сохранялся.
            expect(whoCanReach(OrdersController, 'findAll')).toContain(UserRole.ACCOUNTANT);
        });

        it('но создавать и менять заявки бухгалтер не может', () => {
            // Доступ расширен только на чтение списка.
            expect(whoCanReach(OrdersController, 'create')).not.toContain(UserRole.ACCOUNTANT);
        });

        it('водитель и грузополучатель к списку заявок по-прежнему не допущены', () => {
            const who = whoCanReach(OrdersController, 'findAll');
            expect(who).not.toContain(UserRole.DRIVER);
            expect(who).not.toContain(UserRole.RECIPIENT);
        });
    });

    describe('профиль компании', () => {
        it('бухгалтер читает профиль своей компании', () => {
            // Экраны заявок грузят контрагентов и профиль одной пачкой, чтобы
            // подставить в список сторон свою компанию. Пока сюда не пускали,
            // падала вся пачка: бухгалтер видел «Не удалось загрузить список
            // контрагентов» и пустое поле контрагента.
            expect(whoCanReach(CompanyController, 'getCompanyProfile')).toContain(UserRole.ACCOUNTANT);
            expect(whoCanReach(CompanyController, 'getProfileStatus')).toContain(UserRole.ACCOUNTANT);
        });

        it('но менять реквизиты компании бухгалтер не может', () => {
            // Доступ расширен только на чтение: реквизиты меняет директор.
            expect(whoCanReach(CompanyController, 'updateCompanyProfile')).not.toContain(UserRole.ACCOUNTANT);
        });

        it('водитель и грузополучатель к профилю компании не допущены', () => {
            for (const method of ['getCompanyProfile', 'getProfileStatus', 'updateCompanyProfile']) {
                const who = whoCanReach(CompanyController, method);
                expect(who).not.toContain(UserRole.DRIVER);
                expect(who).not.toContain(UserRole.RECIPIENT);
                expect(who).not.toContain(UserRole.PARTNER);
            }
        });
    });

    describe('очередь на складе', () => {
        it('свою очередь смотрят завсклад и администратор компании', () => {
            const who = whoCanReach(WarehouseController, 'getMyQueue');
            expect(who).toContain(UserRole.WAREHOUSE_MANAGER);
            expect(who).toContain(UserRole.COMPANY_ADMIN);
        });

        it('`queue/my` объявлен раньше `queue/:locationId`', () => {
            // Порядок здесь — не стиль, а поведение: маршруты разбираются
            // сверху вниз, и при обратном порядке «my» уезжало в соседний
            // маршрут как id склада. Завсклад получал вечно пустую очередь,
            // администратор — 403.
            const src = readFileSync(
                join(__dirname, '../warehouse/warehouse.controller.ts'), 'utf8');
            expect(src.indexOf("@Get('queue/my')"))
                .toBeLessThan(src.indexOf("@Get('queue/:locationId')"));
        });
    });

    /**
     * Здесь фиксируется найденное, а не желаемое. Если поведение неверное —
     * это решает владелец, а тест меняется вместе с кодом, осознанно.
     */
    describe('замеченные особенности — зафиксированы как есть', () => {
        it('водитель и грузополучатель проходят PermissionsGuard насквозь', () => {
            // Их права разделов не настраиваются, ограничивает только @Roles.
            // Значит на эндпоинте без @Roles такая роль пройдёт куда угодно —
            // при добавлении новых эндпоинтов про это надо помнить.
            const ctx = contextFor(AccountingDocumentsController, 'create',
                { role: UserRole.DRIVER, permissions: [], sub: 'u', companyId: 'c' });
            expect(permissionsGuard.canActivate(ctx)).toBe(true);
            // И всё же до действия он не доходит — его отсекает RolesGuard.
            expect(allowed(AccountingDocumentsController, 'create', UserRole.DRIVER)).toBe(false);
        });

        it('загрузка документов к рейсу открыта всем ролям с правом раздела', () => {
            // DocumentsController не сужает роли декоратором @Roles на методе
            // загрузки — держат только права раздела. Зафиксировано, чтобы
            // изменение было заметным.
            const who = whoCanReach(DocumentsController, 'uploadFile');
            expect(who).toContain(UserRole.DRIVER);
            expect(who).toContain(UserRole.LOGISTICIAN);
        });
    });
});
