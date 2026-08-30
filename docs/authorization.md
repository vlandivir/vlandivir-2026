# Авторизация: кто и куда имеет доступ

Актуально на август 2026. При изменении guard'ов или ключей — обновляйте этот файл.

## Кто имеет доступ

**Любой Google-аккаунт (сессия).** Вход через `GET /auth/google` (OAuth code flow).
После входа берётся verified email из `id_token` — allowlist на этом шаге больше
не проверяется. Сессия — JWT в httpOnly-cookie `vl_session` на 30 дней, подпись
`SESSION_SECRET`. Тот же JWT принимается в заголовке `Authorization: Bearer <token>`
(desktop Tauri app, iOS GTD app). Выход: `GET /auth/logout`. Проверка: `GET /auth/me`
(поле `isAdmin: true|false`). Обычный пользователь получает: свой GTD workspace,
синхронизацию списка страниц Subs/GPX (`/user-pages-api/pages`, import локального каталога). Не получает
дневник, почту, рилсы, правку карты и админку поездок.

**Админ / владелец.** Email из `ALLOWED_GOOGLE_EMAILS` (через запятую). Сейчас:
`vladimir.rybakov@gmail.com`. Проверка: `AuthService.isAdminSession` /
`AdminSessionGuard`. Desktop handoff: после Google login браузер открывает
`GET /auth/desktop-handoff?port=<1024–65535>` (нужна валидная сессия) → redirect на
`http://127.0.0.1:<port>/?token=<jwt>`. Native (iOS) handoff:
`GET /auth/native-handoff?redirect_uri=<allowlisted>` → redirect на
`redirect_uri?token=<jwt>`. Allowlist URI: custom scheme `vlandivir-gtd://auth` и
loopback `http://127.0.0.1|localhost` (для отладки).

**Машинные клиенты (скрипты, интеграции).** Секретные ключи в заголовках,
значения — в env (см. таблицу env ниже). URL-секретов больше нет.

## Механизмы (где в коде)

| Механизм | Файл | Поведение без доступа |
|---|---|---|
| `GoogleSessionGuard` | `src/auth/google-session.guard.ts` | Страницы (GET + Accept: html) — redirect на `/auth/google`; API — 401. Любая валидная Google-сессия |
| `AdminSessionGuard` | `src/auth/admin-session.guard.ts` | Нет сессии: как GoogleSessionGuard; есть сессия, но email не в allowlist — 403 |
| `EditAccessGuard` | `src/auth/edit-access.guard.ts` | 401. Пускает: **admin-сессия** ИЛИ `x-map-api-key`/`x-reels-api-key` = `REELS_API_KEY` \|\| `MAP_API_KEY` \|\| `NOTE_API_KEY` |
| `canEdit()` (map-api) | `src/map-api.controller.ts` | Для `?force=1` в instagram-meta: admin-сессия или ключ, иначе 401 |
| Локальные проверки ключей | `src/notes-api.controller.ts`, `src/notifications-api.controller.ts`, `src/mcp/mcp.controller.ts` | 401 |
| Подпись Telegram initData | `src/mini-app/mini-app.controller.ts`, `src/gtd/gtd-auth.service.ts` | 401 при неверной подписи; GTD создаёт отдельное workspace при первом валидном входе |
| `GtdAuthGuard` | `src/gtd/gtd-auth.guard.ts` | Принимает Google session или `x-telegram-init-data`, резолвит identity и строго скоупит workspace |
| OAuth-модуль (вход/сессии) | `src/auth/auth.service.ts`, `src/auth/auth.controller.ts` | — |

## Матрица маршрутов

### Публичное (без авторизации)

| Что | Маршруты | Где обозначено |
|---|---|---|
| Статические страницы | `/`, `/home`, `/subs`, `/gpx-route-png`, `/files`, `/places`, `/trip` (+ статика `/shared`, `/mini-app`; shell Mini App не содержит приватных данных) | `src/main.ts` (useStaticAssets) |
| Share-страницы карты | `/places/point/:id`, `/places/track/:id` | `src/map-pages.controller.ts` |
| Альбомы поездок (страницы) | `/trip`, `/trip/:secret`, `/trip/en`, `/trip/en/:secret` | `src/app.controller.ts` + `src/main.ts` |
| API альбомов поездок | `POST/GET/PATCH /trip-api/trips…`, `GET /trip-api/my-trips`, uploads check/complete, `GET /trip-api/trips/:secret/media/:id/download`, soft-delete media | `src/trip-api.controller.ts` — доступ по `secret` в URL; download выдаёт короткую подписанную ссылку на оригинал с `Content-Disposition: attachment`; авторство через `contributorId` (клиент) / `X-Contributor-Id`; `GET /my-trips` — список созданных альбомов по `X-Contributor-Id`; админы (Google allowlist) видят soft-deleted |
| Список всех альбомов (admin) | `GET /trip-api/admin/trips` | `src/trip-api.controller.ts` — **только Google admin** (`isAdminSession` / Bearer JWT) |
| Монтаж видео поездки | `GET/POST/PATCH/DELETE /trip-api/trips/:secret/projects…`, клипы (order/trim), `POST …/export` (фоновая сборка ZIP → Spaces), `GET …/export` (статус) | `src/trip-api.controller.ts` — **только Google admin** (`isAdminSession`); проекты в рамках одной поездки. Trim/ZIP UI — в desktop; web оставляет create project + выбор клипов |
| Чтение карты | `GET /map-api/points`, `/tracks`, `/tags`, `/resolve-google-link` | `src/map-api.controller.ts` (без guard) |
| Семантический поиск по карте | `GET /map-api/search?q=` | `src/map-api.controller.ts` (без авторизации, но с rate-limit `MapSearchThrottleGuard` — 30 запросов/мин на IP, `src/common/rate-limit.guard.ts`); ищет по точкам/трекам с прикреплённым рилсом через эмбеддинги рилсов, при гео-запросе фильтрует по расстоянию (геокодинг Nominatim) |
| Обновление Instagram-меты (без force) | `POST /map-api/{points,tracks}/:id/instagram-meta` | там же; окно 24 ч защищает от злоупотребления |
| Subs-инструменты | `/subs-api/*` (загрузка видео, транскрипция, рендер, ASS, список артефактов в `manifest.json`) | `src/subs.controller.ts` — **без авторизации, публичный инструмент**; при наличии сессии страница попадает в список пользователя |
| GPX-проекты | `POST/GET /gpx-api/projects…`, загрузка артефактов | `src/gpx-api.controller.ts` — **без авторизации**; страница `/gpx-route-png/:hash` |
| Вход/выход | `/auth/google`, `/auth/google/callback`, `/auth/logout`, `/auth/me`, `/auth/desktop-handoff`, `/auth/native-handoff` | `src/auth/auth.controller.ts` |

### Любая сессия Google (не только админ)

| Что | Маршруты | Где обозначено |
|---|---|---|
| GTD web app | `GET /gtd`, `GET /gtd/link` | `src/gtd/gtd-pages.controller.ts`; каждый Google-аккаунт получает своё workspace |
| Список страниц Subs/GPX | `GET/POST /user-pages-api/pages`, `POST /user-pages-api/pages/import` | `src/user-pages.controller.ts` (`GoogleSessionGuard`); JSON в Spaces `users/{sha256(email)}/pages.json`. Без сессии список живёт в IndexedDB браузера; при входе локальные страницы копируются на сервер, UI показывает серверный список; после выхода — снова только локальный |

### Только админ (`AdminSessionGuard` / `isAdminSession`)

| Что | Маршруты | Где обозначено |
|---|---|---|
| Записная книжка рилсов (страницы) | `GET /reels`, `GET /reels/:id` | `src/reels-pages.controller.ts` |
| Дашборд почты (страница) | `GET /email` | `src/email-pages.controller.ts` |
| Композер Threads (страница) | `GET /threads` | `src/threads-pages.controller.ts` |
| API Threads | `GET/POST/PATCH/DELETE /threads-api/*` | `src/threads-api.controller.ts` (guard на классе) |
| API почты | `GET/POST /email-api/*` (stats, messages, sync, `POST /messages/:id/to-gtd`) | `src/email-api.controller.ts` (guard на классе) |
| Дневник (страницы) | `GET /diary`, `GET /diary/:MM-DD`, `GET /diary/archive` | `src/diary-pages.controller.ts`; записи скоупятся к личному чату владельца |
| API дневника | `GET /diary-api/calendar`, `GET /diary-api/day`, `GET /diary-api/archive`, `PATCH/DELETE /diary-api/notes/:id`, `POST /diary-api/notes/:id/restore`, `POST /diary-api/notes/:id/videos`, `PATCH /diary-api/images/:id`, `POST /diary-api/images/:id/describe`, `PATCH /diary-api/videos/:id`, `POST /diary-api/videos/:id/send` | `src/diary-api.controller.ts` (guard на классе); soft-delete через `Note.deletedAt` |

### Google-сессия ИЛИ подписанный Telegram initData

| Что | Маршруты | Поведение |
|---|---|---|
| GTD API | `GET/POST/PATCH /gtd-api/*` | `GtdAuthGuard`: Google cookie / Bearer JWT или `x-telegram-init-data`; все проекты, задачи, история и вложения скоупятся по workspace. Sync helpers for native: `GET /gtd-api/tasks` (ACTIVE/ALL + `updatedSince`), `GET /gtd-api/projects` |
| Привязка GTD | `POST /gtd-api/link/start`, `GET /gtd-api/link/preview`, `POST /gtd-api/link/confirm` | Старт — только Telegram identity, preview/confirm — только Google identity; одноразовый токен 10 минут, привязка опциональна |

Старые секретные ссылки `/reels/<secret>[/<id>]` удалены: `/reels/<не-число>` →
redirect `/reels`, `/reels/<secret>/<id>` → 301 на `/reels/<id>` (дальше вход).

### Admin-сессия ИЛИ машинный ключ (`EditAccessGuard`)

| Что | Маршруты | Заголовок для машин |
|---|---|---|
| Мутации карты | `POST/PATCH/DELETE /map-api/{points,tracks,tags}`, `POST /map-api/key-check` | `x-map-api-key` |
| Instagram-мета с `?force=1` | `POST /map-api/.../instagram-meta?force=1` | `x-map-api-key` |
| Чтение рилсов | `GET /reels-api/reels[...]`, `/search`, `/ask` | `x-reels-api-key` |
| Мутации рилсов | `POST/DELETE /reels-api/...` (создание, retry, теги, transcribe, vision, embed, key-check) | `x-reels-api-key` |

### Только машинные ключи / другие механизмы

| Что | Маршруты | Авторизация |
|---|---|---|
| Заметки из скриптов | `POST /notes-api/notes` | `x-note-api-key` = `NOTE_API_KEY`; картинка опциональна, text-only тоже принимается |
| Уведомления | `POST /notifications-api/messages` | `x-notification-api-key` = `NOTE_API_KEY` |
| MCP-сервер | `POST /mcp` | публичные инструменты (карта) — без ключа; рилсы и Threads — `Authorization: Bearer <MCP_API_KEY>`; дневник — тот же ключ + `X-Chat-Id` (числовой Telegram chat id владельца дневника); GTD — `Authorization: Bearer <mcpToken пространства>` из настроек GTD / `/gtdkey`, без `X-Chat-Id` |
| Telegram Mini App profile | `GET /mini-app-api/*` | подпись `initData` токеном бота |
| Telegram webhook | `POST /telegram-bot` | безопасность на стороне Telegram (токен бота при setWebhook) |

## Секреты (env)

Локально — `.env`; прод — GitHub secrets → `docker run -e` (`.github/workflows/deploy-production.yml`). Не класть секреты в `Dockerfile` `ARG`/`ENV`.

| Переменная | Что даёт |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth-клиент Google (консоль: проект с consent screen) |
| `SESSION_SECRET` | Подпись JWT сессий и state |
| `ALLOWED_GOOGLE_EMAILS` | Allowlist **админов** (через запятую). Войти может любой Google-аккаунт; админские разделы — только эти email |
| `MAP_API_KEY` | Машинный ключ редактирования карты и рилсов |
| `NOTE_API_KEY` | Ключ notes/notifications API; принимается и как fallback ключа карты |
| `REELS_API_KEY` | Необязательный отдельный ключ рилсов (не задан — используется `MAP_API_KEY`) |
| `MCP_API_KEY` | Приватные MCP-инструменты: рилсы, Threads и дневник |
| `THREADS_ACCESS_TOKEN` | Токен Threads Graph API для публикации и Insights |
| `EMAIL_ACCOUNTS` | App-пароли IMAP (не для HTTP-доступа) |
| `TELEGRAM_OWNER_CHAT_ID` | Личный Telegram chat id владельца (дневник, notes/notifications, subs) |
| `TELEGRAM_CHANNEL_IDS` | Id каналов через запятую; посты дублируются в чат владельца |
| ~~`REELS_PAGE_KEY`~~ | Удалён (июль 2026) — секретные URL рилсов больше не работают |

## Как дать доступ ещё одному человеку

**GTD и список страниц Subs/GPX:** достаточно входа через Google — отдельный
allowlist не нужен, у каждого аккаунта своё workspace и свой список страниц.
MCP-ключ GTD живёт на workspace (`mcpToken`): один ключ на связанную пару
Google+Telegram. Смотреть и копировать — настройки `/gtd` / Mini App / iOS,
или Telegram `/gtdkey`.

**Админ (дневник, почта, рилсы, Threads, правка карты, монтаж поездок):**

1. Добавить email в `ALLOWED_GOOGLE_EMAILS` в `.env` и `gh secret set ALLOWED_GOOGLE_EMAILS`.
2. Задеплоить. Человек входит своим Google-аккаунтом и получает админские разделы.

