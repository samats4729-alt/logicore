import { driverCompanyOf, tripManagerFor } from './trip-manager';

/** Кнопка WhatsApp водителя ведёт к тому, кто ведёт рейс (владелец, 28.10.2026). */
describe('С кем водителю связаться по рейсу', () => {
    const user = (firstName: string, phone: string | null, isActive = true) => ({ firstName, lastName: 'Паркова', phone, isActive });
    const companies = new Map([
        ['park', { id: 'park', name: 'ТОО «Парк»', phone: '+77010000001' }],
        ['fwd', { id: 'fwd', name: 'ТОО «Экспедитор»', phone: '+77010000002' }],
        ['own', { id: 'own', name: 'ТОО «Своя»', phone: null }],
    ]);

    it('рейс парка — ответственный парка по этому рейсу, а не экспедитора', () => {
        const order = {
            partnerId: 'park', forwarderId: 'fwd',
            responsibles: [{ companyId: 'fwd', user: user('Ерлан', '+77019990002') }, { companyId: 'park', user: user('Алия', '+77019990001') }],
        };
        expect(tripManagerFor(order, null, companies)).toEqual({ name: 'Паркова Алия', phone: '+77019990001', responsible: true });
    });

    it('ответственного нет, без телефона или уволен — общий номер парка', () => {
        for (const responsibles of [[], [{ companyId: 'park', user: user('Алия', null) }], [{ companyId: 'park', user: user('Алия', '+77019990001', false) }]]) {
            expect(tripManagerFor({ partnerId: 'park', forwarderId: 'fwd', responsibles }, null, companies))
                .toEqual({ name: 'ТОО «Парк»', phone: '+77010000001', responsible: false });
        }
    });

    it('штатный водитель компании — её ответственный; нет ни его, ни телефона компании — кнопки нет', () => {
        expect(driverCompanyOf({ partnerId: null, forwarderId: 'fwd' }, 'own')).toBe('own');
        expect(tripManagerFor({ partnerId: null, forwarderId: 'fwd', responsibles: [] }, 'own', companies)).toBeNull();
        expect(tripManagerFor({ partnerId: null, forwarderId: 'fwd', responsibles: [{ companyId: 'own', user: user('Марат', '+77019990003') }] }, 'own', companies))
            .toEqual({ name: 'Паркова Марат', phone: '+77019990003', responsible: true });
    });
});
