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
const fs = require('fs');
const path = require('path');

/**
 * Файл Firebase для push-уведомлений на Android: Expo доставляет их через
 * Google, и приложению нужен этот файл, чтобы получить адрес телефона. Он не
 * пароль — в нём номер проекта Firebase и название приложения. Нет файла —
 * сборка идёт как раньше, просто без уведомлений.
 */
const GOOGLE_SERVICES = path.join(__dirname, 'google-services.json');

module.exports = ({ config }) => ({
    ...config,
    android: {
        ...config.android,
        ...(fs.existsSync(GOOGLE_SERVICES) ? { googleServicesFile: './google-services.json' } : {}),
    },
    extra: {
        ...config.extra,
        apiUrl: process.env.API_URL || config.extra?.apiUrl,
        googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || config.extra?.googleWebClientId || '',
        // Сайт платформы — для ссылки на политику конфиденциальности.
        siteUrl: process.env.SITE_URL || config.extra?.siteUrl || '',
        // Проверка фото документов (резкость, свет, лист целиком). На тестовом
        // стенде её выключают (PHOTO_CHECK=off), чтобы проходить анкету любыми
        // картинками; в сборках для водителей переменной нет — проверка включена.
        photoCheck: process.env.PHOTO_CHECK !== 'off',
    },
});
