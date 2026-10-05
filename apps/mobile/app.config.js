/**
 * Настройки сборки поверх app.json.
 *
 * Адрес сервера и ключ входа через Google приходят из профиля сборки
 * (eas.json → env): у тестовой сборки — стенд разработчика, у сборки для
 * Google Play — рабочий сервер. Так один и тот же код собирается для обоих
 * без правки файлов руками.
 *
 * GOOGLE_WEB_CLIENT_ID — «веб-клиент» из Google Cloud (тот же, что у входа
 * через Google на сайте). Он не секрет: по нему Google выдаёт приложению
 * пропуск, который сервер проверяет.
 */
module.exports = ({ config }) => ({
    ...config,
    extra: {
        ...config.extra,
        apiUrl: process.env.API_URL || config.extra?.apiUrl,
        googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || config.extra?.googleWebClientId || '',
        // Сайт платформы — для ссылки на политику конфиденциальности.
        siteUrl: process.env.SITE_URL || config.extra?.siteUrl || '',
    },
});
