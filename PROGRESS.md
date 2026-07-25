# LogiCore — локальный запуск

> Проект в продакшене. Правила работы — `AGENTS.md`, дизайн — `REDESIGN_PLAN.md`,
> деплой и откат — `PRODUCTION_DEPLOY.md`, планы по бухгалтерии —
> `ACCOUNTING_ROADMAP.md`.

## Состав

| Приложение | Что это | Локальный адрес |
|------------|---------|-----------------|
| `apps/api` | NestJS + Prisma | http://localhost:3001 |
| `apps/web` | Next.js 14 + Ant Design | http://localhost:3000 |
| `apps/mobile` | Expo (приложение водителя) | Expo Go / dev client |

Инфраструктура из `docker-compose.yml`: PostgreSQL (PostGIS) на `localhost:5433`,
Redis на `localhost:6379`, MinIO на `localhost:9000`.

Swagger доступен на http://localhost:3001/api/docs — только вне продакшена
либо при `SWAGGER_ENABLED=true`.

## Запуск

```bash
docker-compose up -d          # postgres + redis + minio

pnpm install
pnpm db:generate
pnpm dev                      # api + web
# только веб: pnpm dev:web ; только api: pnpm dev:api
```

Мобильное приложение:

```bash
cd apps/mobile
pnpm start
```

## Учётные данные

В репозитории их нет и быть не должно. Локальные значения берутся из `.env`
(шаблоны — `apps/api/.env.example`, `apps/web/.env.example`).

Первый администратор создаётся на старте API из `ADMIN_EMAIL` и
`ADMIN_PASSWORD` и только при `BOOTSTRAP_ADMIN_ON_START=true` (см.
`apps/api/src/main.ts`).

## Проверки перед коммитом

```bash
cd apps/web && npx tsc --noEmit
cd apps/api && npx tsc --noEmit   # если менялся api
pnpm --filter api test
```
