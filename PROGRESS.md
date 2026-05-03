# LogComp — Журнал прогресса

> **Цель:** Система управления логистикой  
> **Начат:** 2026-01-04  
> **Статус:** ✅ Фазы 1-3 созданы

---

## ✅ Фаза 1: Backend — ГОТОВО

| Сервис | URL |
|--------|-----|
| API | http://localhost:3001 |
| Swagger | http://localhost:3001/api/docs |
| PostgreSQL | localhost:5433 |
| Redis | localhost:6379 |

## ✅ Фаза 2: Веб-портал — ГОТОВО

| URL | Описание |
|-----|----------|
| http://localhost:3000 | Next.js портал |
| /login | Авторизация |
| /admin | Админ-панель |

**Тестовый логин:** `admin@logcomp.kz` / `admin123`

## ✅ Фаза 3: Мобильное приложение — ГОТОВО

**Экраны:**
- SMS авторизация водителей
- Активный рейс с управлением статусами
- Карта маршрута
- Профиль

**Технологии:** Expo, React Native, Expo Router, react-native-maps, фоновая геолокация

---

## Как запустить

```bash
# Backend
cd c:\work\logcomp
docker-compose up -d
pnpm dev:api

# Веб-портал
cd apps/web
pnpm dev

# Мобильное (нужен Expo Go)
cd apps/mobile
pnpm install
pnpm start
```
