import { normalizeSignupSource, SIGNUP_SOURCE_GOOGLE_ADS } from './signup-source';

describe('источник регистрации', () => {
    it('реклама Google сохраняется', () => {
        expect(normalizeSignupSource(SIGNUP_SOURCE_GOOGLE_ADS)).toBe(SIGNUP_SOURCE_GOOGLE_ADS);
    });

    it.each([[undefined], [null], [''], ['google'], ['<script>'], [42], [{}]])(
        'незнакомое значение %p не сохраняется и не мешает регистрации',
        (value) => {
            expect(normalizeSignupSource(value)).toBeNull();
        },
    );
});
