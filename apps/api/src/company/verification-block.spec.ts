import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CompanyVerificationService } from './services/company-verification.service';

/**
 * Окончательный отказ: заявку признали чужой.
 *
 * БИН в Казахстане публичен, поэтому зарегистрировать чужую фирму может
 * кто угодно. Обычный отказ на это не отвечает: он рассчитан на замечание
 * («приказ без подписи»), после которого документы прикладывают заново — и
 * заявитель возвращается с тем же БИН хоть каждый день. Хуже того, пока
 * подтверждение не обязательно, он всё это время работает в кабинете под
 * названием чужой фирмы и выставляет от её имени документы.
 *
 * Поэтому у отказа есть вторая форма, и проверяется здесь именно она:
 * подача закрыта, работа закрыта, но настоящему владельцу БИН свободен, а
 * ошибка отменяется.
 */
describe('Подтверждение организации: окончательный отказ', () => {
    const build = (company: Record<string, unknown>, setting = 'false') => {
        const prisma: any = {
            platformSetting: {
                findUnique: jest.fn().mockResolvedValue({ value: setting }),
                upsert: jest.fn().mockResolvedValue({}),
            },
            company: {
                findUnique: jest.fn().mockResolvedValue(company),
                update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({
                    id: 'к-1', name: 'ТОО «Ромашка»', ...data,
                })),
                findFirst: jest.fn().mockResolvedValue(null),
                findMany: jest.fn().mockResolvedValue([]),
            },
            document: { findMany: jest.fn().mockResolvedValue([]) },
        };
        return { service: new CompanyVerificationService(prisma as any, {} as any), prisma };
    };

    const blocked = {
        id: 'к-1',
        verificationStatus: 'REJECTED',
        verificationBlockedAt: new Date('2026-08-17T10:00:00Z'),
        rejectionReason: 'Фирма зарегистрирована не её владельцем',
    };

    it('работа закрыта, даже когда подтверждение не обязательно', async () => {
        // Главное свойство запрета. Рубильник отвечает на вопрос «ждать ли
        // проверку перед началом работы»; здесь проверка уже прошла и
        // решила, что фирма заявителю не принадлежит.
        const { service } = build(blocked, 'false');

        await expect(service.assertVerified('к-1')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.assertVerified('к-1')).rejects.toThrow('отклонена окончательно');
    });

    it('отказ называет причину и путь дальше', async () => {
        const { service } = build(blocked);

        await expect(service.assertVerified('к-1')).rejects.toThrow('не её владельцем');
        await expect(service.assertVerified('к-1')).rejects.toThrow('напишите в поддержку');
    });

    it('подать заявку заново нельзя', async () => {
        const { service } = build(blocked);

        await expect(service.submit('к-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('приложить новые документы нельзя', async () => {
        const { service } = build(blocked);

        await expect(service.attachDocument('к-1', 'п-1', 'COMPANY_REGISTRATION' as any, {
            originalname: 'справка.pdf', buffer: Buffer.from(''), mimetype: 'application/pdf', size: 1,
        })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('кабинет видит запрет и не предлагает отправку', async () => {
        const { service } = build({ ...blocked, name: 'ТОО «Ромашка»', bin: '123456789012' });

        const status = await service.getStatus('к-1');

        expect(status.verificationBlockedAt).toBeTruthy();
        expect(status.canSubmit).toBe(false);
    });

    it('обычный отказ по-прежнему разрешает исправиться', async () => {
        // Иначе настоящая компания, у которой не хватило подписи на приказе,
        // теряет платформу из-за придирки.
        const { service, prisma } = build({
            id: 'к-1', verificationStatus: 'DRAFT', verificationBlockedAt: null, rejectionReason: null,
        });

        await service.reject('к-1', 'админ-1', 'Приказ без подписи');

        expect(prisma.company.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ verificationBlockedAt: null }),
        }));
        await expect(service.assertVerified('к-1')).resolves.toBeUndefined();
    });

    it('отказ с запретом ставит отметку', async () => {
        const { service, prisma } = build({
            id: 'к-1', verificationStatus: 'PENDING', verificationBlockedAt: null, rejectionReason: null,
        });

        await service.reject('к-1', 'админ-1', 'Фирма зарегистрирована не её владельцем', true);

        const data = prisma.company.update.mock.calls[0][0].data;
        expect(data.verificationBlockedAt).toBeInstanceOf(Date);
    });

    it('запрет снимается — ошибка владельца не стоит компании кабинета', async () => {
        const { service, prisma } = build(blocked);

        await service.unblock('к-1');

        expect(prisma.company.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { verificationBlockedAt: null },
        }));
    });

    it('снимать нечего — говорим об этом, а не молчим', async () => {
        const { service } = build({ id: 'к-1', verificationBlockedAt: null });

        await expect(service.unblock('к-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('подтверждение отменяет прежний запрет', async () => {
        // Владелец посмотрел документы ещё раз и решил иначе: оставить
        // отметку значило бы запереть уже подтверждённую компанию.
        const { service, prisma } = build({ id: 'к-1', bin: '123456789012', verificationStatus: 'REJECTED' });

        await service.approve('к-1', 'админ-1');

        expect(prisma.company.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ verificationBlockedAt: null }),
        }));
    });
});

/**
 * Подсказка в очереди: на этот БИН есть другие заявки.
 *
 * Раньше совпадение было видно только против уже подтверждённой компании.
 * Две заявки на один БИН, лежащие в очереди одновременно, выглядели как две
 * обычные строки — и решение принималось, не зная, что рядом лежит вторая.
 */
describe('Очередь проверки: другие заявки на тот же БИН', () => {
    const build = (queue: any[], sameBin: any[]) => {
        const prisma: any = {
            company: {
                findMany: jest.fn()
                    .mockResolvedValueOnce(queue)
                    .mockResolvedValueOnce(sameBin),
            },
        };
        return { service: new CompanyVerificationService(prisma as any, {} as any), prisma };
    };

    it('две заявки на один БИН видят друг друга', async () => {
        // Обе лежат на одной странице очереди. Выборка соседей не должна
        // исключать показанные строки — иначе подсказка молчит ровно там,
        // где она нужна.
        const queue = [
            { id: 'к-1', bin: '123456789012', name: 'ТОО «Ромашка»', documents: [] },
            { id: 'к-2', bin: '123456789012', name: 'ТОО «Ромашка» (настоящая)', documents: [] },
        ];
        const { service } = build(queue, [
            {
                id: 'к-1', bin: '123456789012', name: 'ТОО «Ромашка»', isExternal: false,
                verificationStatus: 'PENDING', verificationBlockedAt: null,
                verificationSubmittedAt: new Date(), createdAt: new Date(), createdByCompany: null,
            },
            {
                id: 'к-2', bin: '123456789012', name: 'ТОО «Ромашка» (настоящая)', isExternal: false,
                verificationStatus: 'PENDING', verificationBlockedAt: null,
                verificationSubmittedAt: new Date(), createdAt: new Date(), createdByCompany: null,
            },
        ]);

        const rows: any[] = await service.listForReview();

        expect(rows[0].binOtherApplications).toHaveLength(1);
        expect(rows[0].binOtherApplications[0].id).toBe('к-2');
        expect(rows[1].binOtherApplications[0].id).toBe('к-1');
    });

    it('своя же строка соседом не считается', async () => {
        const { service } = build(
            [{ id: 'к-1', bin: '123456789012', name: 'ТОО «Ромашка»', documents: [] }],
            [{
                id: 'к-1', bin: '123456789012', name: 'ТОО «Ромашка»', isExternal: false,
                verificationStatus: 'PENDING', verificationBlockedAt: null,
                verificationSubmittedAt: new Date(), createdAt: new Date(), createdByCompany: null,
            }],
        );

        const rows: any[] = await service.listForReview();

        expect(rows[0].binOtherApplications).toEqual([]);
    });

    it('подтверждённая компания остаётся отдельным предупреждением', async () => {
        // Она запрещает подтверждение, а не просто настораживает, — и
        // попадать в общий список «ещё заявки» ей нельзя.
        const { service } = build(
            [{ id: 'к-1', bin: '123456789012', name: 'ТОО «Ромашка»', documents: [] }],
            [{
                id: 'к-9', bin: '123456789012', name: 'ТОО «Ромашка» (работает)', isExternal: false,
                verificationStatus: 'VERIFIED', verificationBlockedAt: null,
                verificationSubmittedAt: new Date(), createdAt: new Date(), createdByCompany: null,
            }],
        );

        const rows: any[] = await service.listForReview();

        expect(rows[0].binVerifiedBy?.id).toBe('к-9');
        expect(rows[0].binOtherApplications).toEqual([]);
    });

    it('закрытый доступ у соседа виден сразу', async () => {
        const { service } = build(
            [{ id: 'к-2', bin: '123456789012', name: 'ТОО «Ромашка» (настоящая)', documents: [] }],
            [{
                id: 'к-1', bin: '123456789012', name: 'ТОО «Ромашка»', isExternal: false,
                verificationStatus: 'REJECTED', verificationBlockedAt: new Date(),
                verificationSubmittedAt: new Date(), createdAt: new Date(), createdByCompany: null,
            }],
        );

        const rows: any[] = await service.listForReview();

        expect(rows[0].binOtherApplications[0].blocked).toBe(true);
    });
});
