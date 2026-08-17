import { ForbiddenException } from '@nestjs/common';
import { CompanyVerificationService } from './services/company-verification.service';

/**
 * Рубильник «подтверждение обязательно».
 *
 * Пока он выключен, компания ведёт учёт с первого дня, а проверка догоняет
 * её. Ошибка в любую сторону дорогая: включённый по недосмотру запирает
 * людей, которым платформу только что продали; выключенный по недосмотру —
 * пускает работать тех, кого никто не смотрел. Поэтому состояние берётся
 * из настройки, а не из умолчания в коде.
 */
describe('Подтверждение организации: обязательность', () => {
    const build = (setting?: string) => {
        const prisma: any = {
            platformSetting: {
                findUnique: jest.fn().mockResolvedValue(setting === undefined ? null : { value: setting }),
                upsert: jest.fn().mockResolvedValue({}),
            },
            company: {
                findUnique: jest.fn().mockResolvedValue({
                    verificationStatus: 'DRAFT', rejectionReason: null,
                }),
            },
        };
        const service = new CompanyVerificationService(prisma as any, {} as any);
        return { service, prisma };
    };

    it('по умолчанию подтверждение не требуется', async () => {
        // Настройки нет вовсе — платформа не должна запирать никого молча.
        const { service } = build();

        await expect(service.isVerificationRequired()).resolves.toBe(false);
    });

    it('неподтверждённая компания работает, пока рубильник выключен', async () => {
        const { service } = build('false');

        await expect(service.assertVerified('к-1')).resolves.toBeUndefined();
    });

    it('включили — неподтверждённую останавливаем с объяснением', async () => {
        const { service } = build('true');

        await expect(service.assertVerified('к-1')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.assertVerified('к-1')).rejects.toThrow('ещё не подтверждена');
    });

    it('отказ по отклонённой компании называет причину', async () => {
        const { service, prisma } = build('true');
        prisma.company.findUnique.mockResolvedValue({
            verificationStatus: 'REJECTED', rejectionReason: 'БИН не совпал со справкой',
        });

        await expect(service.assertVerified('к-1')).rejects.toThrow('БИН не совпал со справкой');
    });

    it('подтверждённая проходит при любом положении рубильника', async () => {
        const { service, prisma } = build('true');
        prisma.company.findUnique.mockResolvedValue({ verificationStatus: 'VERIFIED' });

        await expect(service.assertVerified('к-1')).resolves.toBeUndefined();
    });

    it('переключение записывается настройкой, а не переменной среды', async () => {
        // Иначе владелец не сможет включить обязательность без выкладки.
        const { service, prisma } = build('false');

        await service.setVerificationRequired(true);

        expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ create: { key: 'verification_required', value: 'true' } }),
        );
        // Кэш сброшен — следующий вопрос идёт в базу, а не за старым ответом.
        prisma.platformSetting.findUnique.mockResolvedValue({ value: 'true' });
        await expect(service.isVerificationRequired()).resolves.toBe(true);
    });
});
