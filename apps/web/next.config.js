/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ['antd', '@ant-design/icons'],
    // `output: 'standalone'` здесь стоять не должен.
    //
    // Он собирает отдельный самодостаточный сервер в `.next/standalone` — для
    // тонких образов Docker. Запускаемся мы не им: и Railway, и проверка, и
    // локальный стенд поднимают веб через `next start` (скрипт `start` в
    // package.json). Next.js на это ругался при каждом запуске: «"next start"
    // does not work with "output: standalone"». Предупреждение висело в
    // журнале постоянно и приучало не читать журнал.
    //
    // Плюс 48 МБ собранного сервера, который никто не запускает: по репозиторию
    // на `.next/standalone` не ссылается ни один файл — ни Dockerfile, ни
    // nixpacks, ни рабочий процесс проверки.
    //
    // Если когда-нибудь понадобится образ Docker — вернуть строку и вместе с
    // ней поменять команду запуска на `node .next/standalone/server.js`,
    // скопировав туда `.next/static` и `public`. Одно без другого не работает.
    eslint: {
        // Warning: This allows production builds to successfully complete even if
        // your project has ESLint errors.
        ignoreDuringBuilds: false,
    },
    typescript: {
        // Warning: This allows production builds to successfully complete even if
        // your project has type errors.
        ignoreBuildErrors: false,
    },
};

module.exports = nextConfig;
