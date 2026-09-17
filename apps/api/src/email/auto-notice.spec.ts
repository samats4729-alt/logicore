import { EmailService } from './email.service';

/**
 * Приписка «письмо автоматическое» — в каждом письме.
 *
 * Письма уходят с адреса `noreply`, и ящик этот никто не читает. Люди
 * отвечали на них как на обычную переписку — с вопросами и возражениями по
 * счёту — и ждали ответа, которого не будет. Со стороны получателя это
 * выглядит так, будто им не ответили.
 *
 * Проверяется не шаблон каждого письма, а точка отправки: приписка обязана
 * появляться там, иначе следующее письмо напишут без неё и никто не заметит.
 */

const ТЕКСТ = 'Сообщение создано и отправлено автоматически';

function служба(): { service: any; отправленные: any[] } {
    const отправленные: any[] = [];
    const config = { get: (ключ: string) => (ключ === 'RESEND_API_KEY' ? 'test-key' : undefined) };
    const service: any = new EmailService(config as any);
    // Подменяем сам Resend: наружу ничего не уходит, а письмо остаётся здесь.
    service.resend = { emails: { send: async (письмо: any) => { отправленные.push(письмо); return { data: { id: 'id' } }; } } };
    return { service, отправленные };
}

describe('Письма: приписка об автоматической отправке', () => {
    it('добавляется к письму со страницей', async () => {
        const { service, отправленные } = служба();
        await service.отправить({
            to: 'a@b.kz', subject: 'Тема',
            html: '<!DOCTYPE html><html><body><p>Текст письма</p></body></html>',
        });

        expect(отправленные[0].html).toContain(ТЕКСТ);
        expect(отправленные[0].html).toContain('Ответ на это письмо никто не получит');
    });

    it('встаёт внутри страницы, а не за её пределами', async () => {
        // Часть почтовых программ не показывает то, что стоит после
        // закрытия страницы, — приписки бы просто не было видно.
        const { service, отправленные } = служба();
        await service.отправить({
            to: 'a@b.kz', subject: 'Тема',
            html: '<!DOCTYPE html><html><body><p>Текст</p></body></html>',
        });

        const html: string = отправленные[0].html;
        expect(html.indexOf(ТЕКСТ)).toBeLessThan(html.lastIndexOf('</body>'));
    });

    it('добавляется и к обрывку без закрывающего тега', async () => {
        const { service, отправленные } = служба();
        await service.отправить({ to: 'a@b.kz', subject: 'Тема', html: '<p>Просто текст</p>' });

        expect(отправленные[0].html).toContain(ТЕКСТ);
    });

    it('вложение доходит вместе с письмом', async () => {
        // Приписка не должна стоить письму его бумаг: доверенность и акт
        // уходят вложением, и подмена html не вправе их потерять.
        const { service, отправленные } = служба();
        await service.отправить({
            to: 'a@b.kz', subject: 'Доверенность', html: '<body>Документ во вложении</body>',
            attachments: [{ filename: 'doc.pdf', content: Buffer.from('pdf') }],
        });

        expect(отправленные[0].attachments).toHaveLength(1);
        expect(отправленные[0].attachments[0].filename).toBe('doc.pdf');
        expect(отправленные[0].html).toContain(ТЕКСТ);
    });

    it('ни одно письмо не уходит мимо этой точки', () => {
        // Прямой вызов `resend.emails.send` в обход — это письмо без
        // приписки, и заметить такое можно только по жалобе получателя.
        const src = require('fs').readFileSync(
            require('path').join(__dirname, 'email.service.ts'), 'utf8');
        const прямые = src.split('this.resend!.emails.send').length - 1;
        const всего = src.split('emails.send').length - 1;
        expect(всего).toBe(прямые);
        expect(прямые).toBe(1);
    });
});
