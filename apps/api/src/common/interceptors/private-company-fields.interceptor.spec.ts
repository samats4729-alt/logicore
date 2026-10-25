import { strip } from './private-company-fields.interceptor';

/**
 * Код приглашения парка, печать и подпись не уходят наружу ни в одном
 * ответе: на стенде их отдавали карточка чужой заявки и поиск компаний
 * (владелец, 25.10.2026).
 */
describe('Служебные поля компании — не наружу', () => {
    it('убираются на любой глубине: заявка → перевозчик, список партнёров', () => {
        const out = strip({
            id: 'o1',
            partner: { id: 'p', name: 'Парк', parkInviteCode: 'PRK1', stampImage: 'uploads/s.png', signatureImage: 'uploads/g.png', bin: '123' },
            list: [{ recipient: { name: 'Б', parkInviteCode: 'X' } }],
        }) as any;
        expect(out.partner).toEqual({ id: 'p', name: 'Парк', bin: '123' });
        expect(out.list[0].recipient).toEqual({ name: 'Б' });
    });

    it('даты, буферы и прочее — как есть', () => {
        const at = new Date('2026-10-25');
        const buf = Buffer.from('pdf');
        const out = strip({ at, buf, n: 5, s: 'x' }) as any;
        expect(out.at).toBe(at);
        expect(out.buf).toBe(buf);
        expect(out).toMatchObject({ n: 5, s: 'x' });
    });

    it('код парку отдаётся своим полем — его не трогаем', () => {
        expect(strip({ inviteCode: 'PRK1' })).toEqual({ inviteCode: 'PRK1' });
    });
});
