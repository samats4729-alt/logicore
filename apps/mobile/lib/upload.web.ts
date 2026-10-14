/**
 * Браузер-предпросмотр: описание { uri, name, type } браузер отправляет
 * строкой, а не файлом, и сервер отвечает «property file should not exist».
 * Поэтому сначала достаём сам снимок по его адресу и прикладываем файлом.
 */
export async function appendPhoto(form: FormData, uri: string, name: string): Promise<void> {
    const blob = await (await fetch(uri)).blob();
    // У FormData в типах React Native нет третьего параметра (имени файла), у браузерного — есть.
    (form as unknown as { append(key: string, value: Blob, fileName: string): void }).append('file', blob, name);
}
