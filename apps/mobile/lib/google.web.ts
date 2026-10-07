/** Предпросмотр в браузере: вход через Google работает только в приложении на телефоне. */
const unavailable = () => { throw new Error('Вход через Google работает только в приложении на телефоне'); };
export const GoogleSignin = {
    configure: () => undefined,
    hasPlayServices: async () => true,
    signIn: async () => unavailable(),
    signOut: async () => undefined,
};
export const isSuccessResponse = (_: unknown): _ is { data: { idToken: string | null } } => false;
