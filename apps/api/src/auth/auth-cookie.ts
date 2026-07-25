import { CookieOptions, Response } from 'express';

export const AUTH_COOKIE_NAME = 'logicore_session';

const baseCookieOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
});

export const setAuthCookie = (response: Response, token: string) => {
    response.cookie(AUTH_COOKIE_NAME, token, {
        ...baseCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
};

export const clearAuthCookie = (response: Response) => {
    response.clearCookie(AUTH_COOKIE_NAME, baseCookieOptions());
};

type AuthRequest = {
    headers?: {
        authorization?: string;
        cookie?: string;
    };
};

export const extractBearerToken = (request: AuthRequest | undefined): string | null => {
    const authorization = request?.headers?.authorization;
    if (!authorization) return null;

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
};

export const extractAuthCookie = (request: AuthRequest | undefined): string | null => {
    const cookieHeader = request?.headers?.cookie;
    if (!cookieHeader) return null;

    for (const part of cookieHeader.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        const name = part.slice(0, separator).trim();
        if (name !== AUTH_COOKIE_NAME) continue;
        const value = part.slice(separator + 1).trim();
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    return null;
};

// Explicit API/mobile credentials take precedence. Browser requests normally do
// not send Authorization, so they transparently fall back to the httpOnly cookie.
export const extractAuthToken = (request: AuthRequest | undefined): string | null =>
    extractBearerToken(request) || extractAuthCookie(request);
