/** Предпросмотр в браузере: push-уведомления приходят только в приложение на телефоне. */
export type PushRegistration = 'ok' | 'denied' | 'unavailable' | 'error';
export async function registerPush(): Promise<PushRegistration> {
    return 'unavailable';
}
export async function testPush(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'Уведомления работают только в приложении на телефоне.' };
}
export async function unregisterPush(): Promise<void> {}
export function listenPushTaps(): () => void {
    return () => {};
}
