import {
    AUTH_COOKIE_NAME,
    clearAuthCookie,
    extractAuthCookie,
    setAuthCookie,
} from './auth-cookie';

describe('auth cookie', () => {
    it('extracts the session token from a Cookie header', () => {
        expect(extractAuthCookie({
            headers: { cookie: `theme=dark; ${AUTH_COOKIE_NAME}=signed.jwt.value; locale=ru` },
        })).toBe('signed.jwt.value');
    });

    it('returns null when the auth cookie is absent', () => {
        expect(extractAuthCookie({ headers: { cookie: 'theme=dark' } })).toBeNull();
    });

    it('sets an httpOnly SameSite cookie', () => {
        const response = { cookie: jest.fn() };

        setAuthCookie(response as any, 'signed.jwt.value');

        expect(response.cookie).toHaveBeenCalledWith(
            AUTH_COOKIE_NAME,
            'signed.jwt.value',
            expect.objectContaining({
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
            }),
        );
    });

    it('clears the same cookie on logout', () => {
        const response = { clearCookie: jest.fn() };

        clearAuthCookie(response as any);

        expect(response.clearCookie).toHaveBeenCalledWith(
            AUTH_COOKIE_NAME,
            expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
        );
    });
});
