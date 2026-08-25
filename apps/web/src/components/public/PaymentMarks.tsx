import styles from './payment-marks.module.css';

/**
 * Значки платёжных систем на страницах входа и регистрации.
 *
 * Подключается оплата подписки картой, и человек должен видеть, чем платить,
 * до того как заведёт компанию, — а не обнаружить это на середине оформления.
 *
 * Нарисованы разметкой, а не картинкой: страница входа открывается первой и
 * с любого соединения, а каждый внешний файл — это ещё один запрос, который
 * может не дойти. Плюс значки сами подстраиваются под тёмную тему.
 */
export default function PaymentMarks() {
    return (
        <div className={styles.marks}>
            <span className={styles.label}>Оплата картой</span>

            <span className={styles.mark} title="Visa" aria-label="Visa">
                <span className={styles.visa}>VISA</span>
            </span>

            <span className={styles.mark} title="Mastercard" aria-label="Mastercard">
                {/* Два пересекающихся круга. Средний круг — сама область
                    пересечения: рисовать её отдельно надёжнее, чем режимом
                    наложения, который в части браузеров даёт другой оттенок. */}
                <svg width="30" height="19" viewBox="0 0 30 19" role="presentation" focusable="false">
                    <circle cx="11" cy="9.5" r="7.5" fill="#EB001B" />
                    <circle cx="19" cy="9.5" r="7.5" fill="#F79E1B" />
                    <path
                        d="M15 3.9a7.48 7.48 0 0 0 0 11.2 7.48 7.48 0 0 0 0-11.2Z"
                        fill="#FF5F00"
                    />
                </svg>
            </span>
        </div>
    );
}
