# Авторизация: кто и куда имеет доступ

Актуально на июль 2026. При изменении guard'ов или ключей — обновляйте этот файл.

## Кто имеет доступ

**Владелец (сессия Google).** Вход через `GET /auth/google` (OAuth code flow). После
входа проверяется email из `id_token`: он должен быть в allowlist
`ALLOWED_GOOGLE_EMAILS` (через запятую). Сейчас там: `vladimir.rybakov@gmail.com`.
Любой другой Google-аккаунт получает 403 при попытке входа.
Сессия — JWT в httpOnly-cookie `vl_session` на 30 дней, подпись `SESSION_SECRET`.
Тот же JWT принимается в заголовке `Authorization: Bearer <token>` (desktop Tauri app,
iOS GTD app).
Выход: `GET /auth/logout`. Проверка: `GET /auth/me`.
Desktop handoff: после Google login браузер открывает `GET /auth/desktop-handoff?port=<1024–65535>`
(нужна валидная allowlist-сессия) → redirect на `http://127.0.0.1:<port>/?token=<jwt>`.
Native (iOS) handoff: `GET /auth/native-handoff?redirect_uri=<allowlisted>` → redirect на
`redirect_uri?token=<jwt>`. Allowlist: custom scheme `vlandivir-gtd://auth` и loopback
`http://127.0.0.1|localhost` (для отладки).

**Машинные клиенты (скрипты, интеграции).** Секретные ключи в заголовках,
значения — в env (см. таблицу env ниже). URL-секретов больше нет.

## Механизмы (где в коде)

| Механизм | Файл | Поведение без доступа |
|---|---|---|
| `GoogleSessionGuard` | `src/auth/google-session.guard.ts` | Страницы (GET + Accept: html) — redirect на `/auth/google`; API — 401 |
| `EditAccessGuard` | `src/auth/edit-access.guard.ts` | 401. Пускает: сессия ИЛИ `x-map-api-key`/`x-reels-api-key` = `REELS_API_KEY` \|\| `MAP_API_KEY` \|\| `NOTE_API_KEY` |
| `canEdit()` (map-api) | `src/map-api.controller.ts` | Для `?force=1` в instagram-meta: сессия или ключ, иначе 401 |
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
| API альбомов поездок | `POST/GET/PATCH /trip-api/trips…`, `GET /trip-api/my-trips`, uploads check/complete, soft-delete media | `src/trip-api.controller.ts` — доступ по `secret` в URL; авторство через `contributorId` (клиент) / `X-Contributor-Id`; `GET /my-trips` — список созданных альбомов по `X-Contributor-Id`; админы (Google allowlist) видят soft-deleted |
| Список всех альбомов (admin) | `GET /trip-api/admin/trips` | `src/trip-api.controller.ts` — **только Google admin** (`isAdminSession` / Bearer JWT) |
| Монтаж видео поездки | `GET/POST/PATCH/DELETE /trip-api/trips/:secret/projects…`, клипы (order/trim), `POST …/export` (фоновая сборка ZIP → Spaces), `GET …/export` (статус) | `src/trip-api.controller.ts` — **только Google admin** (`isAdminSession`); проекты в рамках одной поездки. Trim/ZIP UI — в desktop; web оставляет create project + выбор клипов |
| Чтение карты | `GET /map-api/points`, `/tracks`, `/tags`, `/resolve-google-link` | `src/map-api.controller.ts` (без guard) |
| Семантический поиск по карте | `GET /map-api/search?q=` | `src/map-api.controller.ts` (без авторизации, но с rate-limit `MapSearchThrottleGuard` — 30 запросов/мин на IP, `src/common/rate-limit.guard.ts`); ищет по точкам/трекам с прикреплённым рилсом через эмбеддинги рилсов, при гео-запросе фильтрует по расстоянию (геокодинг Nominatim) |
| Обновление Instagram-меты (без force) | `POST /map-api/{points,tracks}/:id/instagram-meta` | там же; окно 24 ч защищает от злоупотребления |
| Subs-инструменты | `/subs-api/*` (загрузка видео, транскрипция, рендер) | `src/subs.controller.ts` — **без авторизации, публичный инструмент** |
| Вход/выход | `/auth/google`, `/auth/google/callback`, `/auth/logout`, `/auth/me`, `/auth/desktop-handoff`, `/auth/native-handoff` | `src/auth/auth.controller.ts` |

### Только сессия Google (владелец)

| Что | Маршруты | Где обозначено |
|---|---|---|
| Записная книжка рилсов (страницы) | `GET /reels`, `GET /reels/:id` | `src/reels-pages.controller.ts` (`GoogleSessionGuard` / `requireSession`) |
| Дашборд почты (страница) | `GET /email` | `src/email-pages.controller.ts` |
| API почты | `GET/POST /email-api/*` (stats, messages, sync) | `src/email-api.controller.ts` (guard на классе) |
| Дневник (страницы) | `GET /diary`, `GET /diary/:MM-DD`, `GET /diary/archive` | `src/diary-pages.controller.ts` (`GoogleSessionGuard` / `requireSession`); записи скоупятся к личному чату владельца |
| API дневника | `GET /diary-api/calendar`, `GET /diary-api/day`, `GET /diary-api/archive`, `PATCH/DELETE /diary-api/notes/:id`, `POST /diary-api/notes/:id/restore`, `POST /diary-api/notes/:id/videos`, `PATCH /diary-api/images/:id`, `POST /diary-api/images/:id/describe`, `PATCH /diary-api/videos/:id`, `POST /diary-api/videos/:id/send` | `src/diary-api.controller.ts` (guard на классе); soft-delete через `Note.deletedAt` |
| GTD web app | `GET /gtd`, `GET /gtd/link` | `src/gtd/gtd-pages.controller.ts`; Google identity получает личное workspace независимо от Telegram |

### Google-сессия ИЛИ подписанный Telegram initData

| Что | Маршруты | Поведение |
|---|---|---|
| GTD API | `GET/POST/PATCH /gtd-api/*` | `GtdAuthGuard`: Google cookie / Bearer JWT или `x-telegram-init-data`; все проекты, задачи, история и вложения скоупятся по workspace. Sync helpers for native: `GET /gtd-api/tasks` (ACTIVE/ALL + `updatedSince`), `GET /gtd-api/projects` |
| Привязка GTD | `POST /gtd-api/link/start`, `GET /gtd-api/link/preview`, `POST /gtd-api/link/confirm` | Старт — только Telegram identity, preview/confirm — только Google identity; одноразовый токен 10 минут, привязка опциональна |

Старые секретные ссылки `/reels/<secret>[/<id>]` удалены: `/reels/<не-число>` →
redirect `/reels`, `/reels/<secret>/<id>` → 301 на `/reels/<id>` (дальше вход).

### Сессия ИЛИ машинный ключ (`EditAccessGuard`)

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
| MCP-сервер | `POST /mcp` | публичные инструменты (карта) — без ключа; приватные (дневник, рилсы) — `Authorization: Bearer <MCP_API_KEY>` (+ `X-Chat-Id` для дневника) |
| Telegram Mini App profile | `GET /mini-app-api/*` | подпись `initData` токеном бота |
| Telegram webhook | `POST /telegram-bot` | безопасность на стороне Telegram (токен бота при setWebhook) |

## Секреты (env)

Локально — `.env`; прод — GitHub secrets → build-args (`.github/workflows/deploy-production.yml`) → `Dockerfile` ARG/ENV.

| Переменная | Что даёт |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth-клиент Google (консоль: проект с consent screen) |
| `SESSION_SECRET` | Подпись JWT сессий и state |
| `ALLOWED_GOOGLE_EMAILS` | Allowlist владельцев (через запятую) |
| `MAP_API_KEY` | Машинный ключ редактирования карты и рилсов |
| `NOTE_API_KEY` | Ключ notes/notifications API; принимается и как fallback ключа карты |
| `REELS_API_KEY` | Необязательный отдельный ключ рилсов (не задан — используется `MAP_API_KEY`) |
| `MCP_API_KEY` | Приватные инструменты MCP |
| `EMAIL_ACCOUNTS` | App-пароли IMAP (не для HTTP-доступа) |
| `TELEGRAM_OWNER_CHAT_ID` | Личный Telegram chat id владельца (дневник, notes/notifications, subs) |
| `TELEGRAM_CHANNEL_IDS` | Id каналов через запятую; посты дублируются в чат владельца |
| ~~`REELS_PAGE_KEY`~~ | Удалён (июль 2026) — секретные URL рилсов больше не работают |

## Как дать доступ ещё одному человеку

1. Добавить email в `ALLOWED_GOOGLE_EMAILS` в `.env` и `gh secret set ALLOWED_GOOGLE_EMAILS`.
2. Задеплоить. Всё — человек входит своим Google-аккаунтом.
