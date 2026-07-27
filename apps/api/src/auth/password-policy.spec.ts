import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginEmailDto, RegisterUserDto, ResetPasswordDto } from './dto/auth.dto';
import { MIN_PASSWORD_LENGTH } from './password-policy';

const errorsFor = async (cls: any, data: Record<string, unknown>) =>
    (await validate(plainToInstance(cls, data))).flatMap((e) => Object.values(e.constraints ?? {}));

describe('Требования к паролю', () => {
    it('короткий пароль при регистрации отклоняется', async () => {
        const errors = await errorsFor(RegisterUserDto, {
            email: 'a@b.kz', password: 'short7', firstName: 'И', lastName: 'И', phone: '+77010000000',
        });
        expect(errors.join(' ')).toContain('не короче');
    });

    it('пароль нужной длины проходит', async () => {
        const errors = await errorsFor(RegisterUserDto, {
            email: 'a@b.kz', password: 'x'.repeat(MIN_PASSWORD_LENGTH), firstName: 'И', lastName: 'И', phone: '+77010000000',
        });
        expect(errors.join(' ')).not.toContain('не короче');
    });

    it('смена пароля тоже требует новой длины', async () => {
        const errors = await errorsFor(ResetPasswordDto, { token: 't', password: 'short7' });
        expect(errors.join(' ')).toContain('не короче');
    });

    it('ВХОД короткий пароль не отклоняет', async () => {
        // У сотрудников, заведённых раньше, пароли по шесть символов.
        // Требование длины на входе заперло бы их снаружи.
        const errors = await errorsFor(LoginEmailDto, {
            email: 'a@b.kz', password: 'old123', deviceId: 'd',
        });
        expect(errors.join(' ')).not.toContain('не короче');
    });
});
