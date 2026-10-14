/**
 * Приложить снимок к отправке. На телефоне React Native сам читает файл по
 * адресу — достаточно описания { uri, name, type }. В браузере-предпросмотре
 * так нельзя (`upload.web.ts`).
 */
export async function appendPhoto(form: FormData, uri: string, name: string): Promise<void> {
    form.append('file', { uri, name, type: 'image/jpeg' } as unknown as Blob);
}
