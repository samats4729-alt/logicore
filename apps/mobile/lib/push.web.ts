/** Предпросмотр в браузере: push-уведомления приходят только в приложение на телефоне. */
export async function registerPush(): Promise<void> {}
export async function unregisterPush(): Promise<void> {}
export function listenPushTaps(): () => void {
    return () => {};
}
