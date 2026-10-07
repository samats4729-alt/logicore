/** Предпросмотр в браузере: защищённого хранилища там нет — обычное хранилище страницы. */
type WebStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const storage = (globalThis as unknown as { localStorage?: WebStorage }).localStorage;

export async function getItemAsync(key: string): Promise<string | null> {
    return storage?.getItem(key) ?? null;
}
export async function setItemAsync(key: string, value: string): Promise<void> {
    storage?.setItem(key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
    storage?.removeItem(key);
}
