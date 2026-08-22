# Project Overview — vlandivir-2025

Architecture for agents and humans. Folder map: [repo-map.md](repo-map.md). Design and deploy: [AGENTS.md](../AGENTS.md). Bot usage: [telegram-bot.md](telegram-bot.md). Access control: [authorization.md](authorization.md).

**What it is:** a personal experimental server at https://vlandivir.com — a NestJS process that runs a Telegram diary bot, REST APIs, and several small web apps (map, reels archive, subtitle editor, GPX tools, GTD, trip albums). Native iOS and a Tauri desktop app live in the same repo; mixed technologies are expected. Single Docker container on a DigitalOcean droplet; PostgreSQL (DO managed, shared between local and prod) and DigitalOcean Spaces (S3) for media.

## Stack

- **Backend:** NestJS 11 (Express), TypeScript, webhook-based Telegram bot via `telegraf`
- **DB:** PostgreSQL via Prisma 6 (`prisma/schema.prisma`; client generated into `src/generated/`)
- **Storage:** DigitalOcean Spaces, bucket `vlandivir-2025` (S3 SDK)
- **LLM:** OpenAI (image description, Whisper transcription, translation, reels tags/titles)
- **Media:** ffmpeg (audio extraction, subtitle rendering), yt-dlp (Instagram download), sharp + canvas (images, collages)
- **Frontends:** vanilla JS/HTML/CSS in `web/` (no bundler); `telegram-app/` — React + Vite (GTD + Telegram Mini App); `mobile/gtd-ios/` and `mobile/gps-tracker-ios/` — SwiftUI; `desktop/trip-montage/` — Tauri 2

## Runtime layout

Entry: [src/main.ts](../src/main.ts) — HTTPS on 443 in prod (certs from `.secret/`), HTTP on 3000 in dev. Serves `web/*` statically and the `telegram-app/dist` bundle at `/mini-app`; the same bundle is served behind Google auth at `/gtd`.

Root module: [src/app.module.ts](../src/app.module.ts) — ConfigModule (global), PrismaModule, ServicesModule, TelegramBotModule + all controllers.

## Controllers (HTTP API)

| Controller | Prefix | Purpose |
|---|---|---|
| [app.controller.ts](../src/app.controller.ts) | `/`, `/en`, `/health`, `/gpx-route-png`, `/subs`, `/files`… | Serves static pages / SPA index routes, health check |
| [notes-api.controller.ts](../src/notes-api.controller.ts) | `/notes-api` | Create a diary note from text, optionally with an image (auth: `x-note-api-key`). Uploads images to Spaces, describes them via LLM, notifies via Telegram |
| [notifications-api.controller.ts](../src/notifications-api.controller.ts) | `/notifications-api` | Send a Telegram message to the primary chat (auth: `x-notification-api-key`) |
| [map-api.controller.ts](../src/map-api.controller.ts) | `/map-api` | CRUD for map points, tracks and the tag dictionary; Instagram-meta refresh (24h cache in JSONB, covers copied to Spaces); Google Maps short-link resolver; public semantic search (`GET /search`, reuses reel embeddings, returns only features with an attached reel — [map-search.service.ts](../src/services/map-search.service.ts)). Reads are public, writes need `x-map-api-key` |
| [map-pages.controller.ts](../src/map-pages.controller.ts) | `/places/point/:id`, `/places/track/:id` | Server-side Open Graph tags for shareable map links (injected into `web/places/index.html`) |
| [reels-api.controller.ts](../src/reels-api.controller.ts) | `/reels-api` | Instagram reels archive: create/retry/delete, transcribe (Whisper), vision (frame extraction + LLM), tag/title generation, semantic search (`GET /search`), Q&A (`GET /ask`) + embeddings backfill (`POST /embed-all`). Reads: `x-reels-page-key`, writes: `x-reels-api-key` |
| [reels-pages.controller.ts](../src/reels-pages.controller.ts) | `/reels/:secret`, `/reels/:secret/:id` | Unlisted reels catalog (secret = `REELS_PAGE_KEY`); per-reel OG tags |
| [email-api.controller.ts](../src/email-api.controller.ts) | `/email-api` | IMAP mail dashboard (Google admin) |
| [threads-api.controller.ts](../src/threads-api.controller.ts) | `/threads-api` | Threads composer: drafts, image upload, publish to Threads Graph API + diary copy, Insights/replies. Google admin |
| [threads-pages.controller.ts](../src/threads-pages.controller.ts) | `/threads` | Owner-only composer page; serves `web/threads/index.html` |
| [mcp/mcp.controller.ts](../src/mcp/mcp.controller.ts) | `/mcp` | Stateless MCP server (Streamable HTTP). Public tools: map search/get/tags. `Authorization: Bearer <MCP_API_KEY>` adds reels tools (search/get/ask) and Threads tools (list/get/create/update/publish/insights); plus `X-Chat-Id` adds diary tools (search/get note/get day/ask). GTD tools (`gtd_now`, `gtd_search`, `gtd_get`, `gtd_capture`, `gtd_add_context`) use `Authorization: Bearer <workspace mcpToken>` from GTD settings or Telegram `/gtdkey` — no `X-Chat-Id`. Tools live in [mcp/mcp-tools.service.ts](../src/mcp/mcp-tools.service.ts) |
| [subs.controller.ts](../src/subs.controller.ts) | `/subs-api` | Subtitle pipeline: upload vertical video → extract MP3 + waveform manifest → Whisper transcript → LLM translation → ffmpeg render with ASS subtitles → download. Everything cached in Spaces under `subs/*` by video hash |
| [mini-app/mini-app.controller.ts](../src/mini-app/mini-app.controller.ts) | `/mini-app-api` | Telegram Mini App backend: verifies signed initData, returns user profile/note count/avatar |
| [gtd/gtd-api.controller.ts](../src/gtd/gtd-api.controller.ts) | `/gtd-api` | Private GTD API for projects, one-task queue, snoozing, archive, history, private attachments, JSON context (`POST /tasks/:id/context`), sync list endpoints (`GET /tasks`, `GET /projects`), workspace MCP token (`GET /mcp-token`, `POST /mcp-token/regenerate`) and optional Google ↔ Telegram account linking; accepts Google session/Bearer or signed Telegram initData |
| [gtd/gtd-pages.controller.ts](../src/gtd/gtd-pages.controller.ts) | `/gtd`, `/gtd/link` | Google-session-protected GTD page and account-link confirmation page |
| [diary-pages.controller.ts](../src/diary-pages.controller.ts) | `/diary`, `/diary/:MM-DD`, `/diary/archive` | Owner-only diary web app (Google session): calendar landing + one day-of-month across years + soft-deleted archive; serves `web/diary/index.html` |
| [diary-api.controller.ts](../src/diary-api.controller.ts) | `/diary-api` | Owner-only diary API (Google session): `GET /calendar`, `GET /day`, `GET /archive`, `PATCH/DELETE /notes/:id` (edit / soft-delete via `deletedAt`), `POST /notes/:id/restore`, `POST /notes/:id/videos` (upload up to 100 MB, optional `?notify=1` → Telegram), `PATCH /images/:id`, `POST /images/:id/describe`, `PATCH /videos/:id`, `POST /videos/:id/send` (push clip to Telegram). Note/image edits drop the matching search embedding for lazy re-index (videos aren't indexed). Scoped to the owner's chat |
| [trip-api.controller.ts](../src/trip-api.controller.ts) | `/trip-api` | Shared trip photo/video albums: create by anyone, access via unlisted `secret`; `GET /my-trips` lists albums owned by the client `contributorId`; `GET /admin/trips` lists all albums for Google admin (desktop app); visited albums also tracked in browser IndexedDB (`web/trip/registry.js`); presigned PUT to Spaces; SHA-256 dedup; soft-delete own media; Google allowlist admins see deleted items; admin-only montage projects (`/projects…`: order/trim metadata; server ZIP export still exists but web UI no longer triggers it — CapCut folder export is in `desktop/trip-montage`) |

## Telegram bot (`src/telegram-bot/`)

[telegram-bot.service.ts](../src/telegram-bot/telegram-bot.service.ts) registers everything; updates arrive via webhook (`VLANDIVIR_2025_WEBHOOK_URL`) handled by [telegram-bot.controller.ts](../src/telegram-bot/telegram-bot.controller.ts) — no polling.

**Core behavior:** any text/photo/video sent to the bot is auto-saved as a diary `Note` (optional date in the first line, many formats — see [date-parser.rules.ts](../src/services/date-parser.rules.ts)). Photos get an LLM description. Channel posts are dual-saved to the channel chat and the creator's personal chat. Videos >20 MB can't be fetched via Bot API — use `/v <url>`. In a **private chat**, a message that contains an Instagram reel/post link is instead added to the shared reels notebook (creates/dedups a `Reel` by shortcode and kicks off background download/analysis — same flow as `POST /reels-api/reels`), rather than saved as a diary note (`handleReelLink` in [telegram-bot.service.ts](../src/telegram-bot/telegram-bot.service.ts)). Once background processing settles, `ReelsService.processInBackground` fires an optional `onComplete(reelId)` callback the bot uses to reply with a share link (`/reels/<REELS_PAGE_KEY>/<id>`) plus minimal metadata (title, author, duration, tags), or the failure reason.

**Commands:**

| Command | Handler | What it does |
|---|---|---|
| `/d`, `/dairy` | [dairy-commands.service.ts](../src/telegram-bot/dairy-commands.service.ts) | Show notes for a date (or same day across years) |
| `/f`, `/find` | [find-commands.service.ts](../src/telegram-bot/find-commands.service.ts) | Semantic search over the chat's notes and photo descriptions (pgvector) |
| `/q`, `/ask` | [find-commands.service.ts](../src/telegram-bot/find-commands.service.ts) | Answer a question from the diary (RAG: retrieved notes → LLM, cites dates) |
| `/history` | [history-commands.service.ts](../src/telegram-bot/history-commands.service.ts) | Generate HTML history page, upload to Spaces, return secret UUID link |
| `/s` | [serbian-commands.service.ts](../src/telegram-bot/serbian-commands.service.ts) | Serbian translation (private chats only) |
| `/p`, `/phrase` | [foreign-commands.service.ts](../src/telegram-bot/foreign-commands.service.ts) | RU/EN/SR phrase translation via LLM (private only) |
| `/c`, `/collage` | [collage-commands.service.ts](../src/telegram-bot/collage-commands.service.ts) | Interactive collage builder (3–5 photos, canvas rendering, inline-button flow via callback_query) |
| `/a` | inline | Open the GTD Telegram Mini App |
| `/v`, `/video` | inline | Save a video by direct URL (bypasses 20 MB limit) |
| `/bar` | inline | Ask for location, show distance to a bar + static map |
| `/dl`, `/debuglog` | inline | Export in-memory debug log ([debug-log.service.ts](../src/services/debug-log.service.ts)) to Spaces |
| `/help` | inline | Command list |

## Shared services (`src/services/`)

- [storage.service.ts](../src/services/storage.service.ts) — all Spaces uploads/downloads (chat media, subs artifacts, arbitrary keys)
- [llm.service.ts](../src/services/llm.service.ts) — OpenAI wrapper (image description in Russian)
- [reels.service.ts](../src/services/reels.service.ts) — reels pipeline: yt-dlp download, cover/audio extraction, Whisper, frame vision, tag/title generation, search-embedding upsert; fire-and-forget background processing with status fields on the `Reel` model
- [trip-projects.service.ts](../src/services/trip-projects.service.ts) — per-trip CapCut montage (`TripProject` / `TripProjectClip`): order videos, optional stream-copy trim to Spaces, background ZIP export (legacy; desktop app exports a local folder instead). API gated to Google admin
- Desktop CapCut tool: [desktop/trip-montage/](../desktop/trip-montage/) — Tauri 2 app, Google OAuth handoff (`/auth/desktop-handoff`), lazy media cache, local ffmpeg `-c copy` export
- iOS GTD client: [mobile/gtd-ios/](../mobile/gtd-ios/) — SwiftUI app, Google OAuth via `/auth/native-handoff`, Bearer JWT, SwiftData offline cache + mutation outbox synced to `/gtd-api`
- [embeddings.service.ts](../src/services/embeddings.service.ts) — semantic search: OpenAI `text-embedding-3-small` (override via `EMBEDDING_MODEL`) + pgvector; unified `Embedding` table (`kind`: reel | note | image, `chatId` scopes private kinds), raw-SQL upsert and cosine search; optional `refIds` allowlist restricts a search to a subset of rows
- [map-search.service.ts](../src/services/map-search.service.ts) — `GET /map-api/search` backend: semantic search over map points/tracks that have an attached Instagram reel; reuses the reel embeddings (restricted via `refIds` to reels linked from the map), dedupes to unique features ranked by similarity. A geographic constraint in the query (parsed by [map-geo-query.ts](../src/services/map-geo-query.ts): place + radius like "в часе езды от Белграда") is geocoded via Nominatim and used to filter results by haversine distance. The endpoint is rate-limited by [rate-limit.guard.ts](../src/common/rate-limit.guard.ts) (30 req/min per IP, in-memory)
- [diary-search.service.ts](../src/services/diary-search.service.ts) — `/f` bot command backend: lazily indexes missing notes/image descriptions (per chat) before each search, merges note+image hits per note, strictly chatId-scoped
- [reels-qa.service.ts](../src/services/reels-qa.service.ts) — `GET /reels-api/ask` backend: RAG over the reels notebook (top-10 reels → `gpt-5-mini` via `REELS_LLM_MODEL`), answers strictly from excerpts, references reels as `[#id]` for the UI to link
- [diary-qa.service.ts](../src/services/diary-qa.service.ts) — `/q` bot command backend: RAG answer over retrieved notes (top-12 → `gpt-5-mini`, override via `DIARY_LLM_MODEL`); answers strictly from excerpts, cites note dates
- [instagram-meta.service.ts](../src/services/instagram-meta.service.ts) — scrape Instagram post metadata (author, counters, caption, cover)
- [date-parser.service.ts](../src/services/date-parser.service.ts) — extract date from a note's first line
- [pdf.service.ts](../src/services/pdf.service.ts) — renders `/history pdf` export with pdfkit (works in prod; Cyrillic via the bundled `assets/fonts/NotoSans-Regular.ttf`)
- [debug-log.service.ts](../src/services/debug-log.service.ts) — in-memory ring buffer for bot debugging

## Data model (`prisma/schema.prisma`)

- **Note / Image / Video / BotResponse** — diary: note text + raw Telegram message JSON, attached media (Spaces URLs + LLM descriptions), bot replies. Keyed by `chatId` (BigInt) + `noteDate`. Soft-delete via `Note.deletedAt` (hidden from calendar/`/d`/search; recoverable from `/diary/archive`)
- **MapPoint / MapTrack / MapTag** — places map: coordinates or polylines, tags, `instagramMeta` JSONB cache
- **Reel** — Instagram reel archive: shortcode, status machine (`pending/ready/error`), transcript + vision fields with their own statuses, tags, yt-dlp metadata dump
- **Trip / TripMedia** — shared trip albums: unlisted `secret` URL, original media on Spaces keyed by content hash, JPEG `thumbUrl` (~480px via sharp/ffmpeg) for cheap gallery previews, uploader metadata (`contributorId`, display name, user-agent, optional dimensions/`takenAt`/`cameraModel`), full capture tags in `exif` JSONB (EXIF for photos, ffprobe tags for videos), soft-delete via `deletedAt`
- **ChatSettings / Todo / Question / Answer / TaskNote / TaskImage** — defined in the schema but not referenced anywhere in `src/` (planned features); the tables may contain data, check before dropping
- **GtdWorkspace / GtdIdentity / GtdProject / GtdTask / GtdTaskEvent / GtdAttachment / GtdLinkRequest / GtdEmbedding** — isolated GTD model. Google and Telegram identities start with independent workspaces and can optionally be merged 1:1; none of the legacy todo tables are reused. `GtdEmbedding` is a workspace-scoped pgvector index (cuid task ids), separate from diary/reels `Embedding`.
- **ThreadsPost / ThreadsImage** — Threads composer: draft or published post, optional poll/topic/ghost, Spaces images under `threads/YYYY/MM/`, Insights JSONB and reply dump

## Web apps (`web/`)

| Dir | What | Notes |
|---|---|---|
| `home/` | Landing page | Bilingual via single-file i18n (`index.html` + `i18n.js`); served at `/` and `/en` |
| `places/` | Leaflet map of points/tracks | Vanilla JS SPA; split-panel desktop / drawer mobile; see AGENTS.md for detailed rules |
| `reels/` | Reels catalog | Vanilla JS; Google session (old `/reels/<secret>` URLs redirect) |
| `diary/` | Diary calendar + note editor | Vanilla JS SPA behind Google sign-in; year-agnostic calendar → `/diary/MM-DD` day view, inline note editing, soft-delete archive (`/diary/archive`), video upload + send-to-Telegram, enlarged images with an editable/regenerable description |
| `email/` | Mail UI | Google session; IMAP ingest on the server; кнопка «В GTD» и эффект правила `createGtdTask` |
| `threads/` | Threads composer | Google session; drafts, images, poll, publish to @vlandivir + diary copy |
| `subs/` | Vertical-video subtitle editor | Vanilla JS; dark workbench palette allowed; bilingual |
| `gpx-route-png/` | GPX → PNG route renderer | Fully client-side; bilingual |
| `gpx-track-demo/` | GPS smoothing demo | Client-side; `/gpx-track-demo` |
| `files/` | Files page | Bilingual |
| `trip/` | Shared trip photo/video album | Secret-link SPA; Google admin montage panel → desktop Trip Montage |
| `shared/` | Theme, header, i18n | See [design-system.md](design-system.md) and AGENTS.md |

Clients that are **not** under `web/`: `telegram-app/` (Vite, `/gtd` and `/mini-app`), `mobile/gtd-ios/`, `mobile/gps-tracker-ios/`, `desktop/trip-montage/`.

## Scripts (`src/scripts/`, run via npm scripts)

`update-image-descriptions`, `check-image-status`, `test-collage`, `generate-history-pdf`, `generate-history-pdf:html`, `generate-history-md`, `import-threads-posts` — maintenance/one-off utilities against the shared DB. Be careful: dev and prod use the same database.

## Environment variables

`TELEGRAM_BOT_TOKEN`, `VLANDIVIR_2025_WEBHOOK_URL`, `POSTGRES_CONNECTION_STRING`, `DO_SPACES_ACCESS_KEY`/`DO_SPACES_SECRET_KEY`, `OPENAI_API_KEY`, `NOTE_API_KEY`, `MAP_API_KEY`, `REELS_API_KEY` (optional; falls back to `MAP_API_KEY`), `MCP_API_KEY`, `THREADS_ACCESS_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `TELEGRAM_CHANNEL_IDS` (comma-separated, optional), `ENVIRONMENT` (DEV/PROD), `PORT`, plus Google OAuth / session vars in [authorization.md](authorization.md). `REELS_PAGE_KEY` was removed. New vars must be added in four places: local `.env`, `Dockerfile` ARG/ENV, `deploy-production.yml` build-args, GitHub secret (see AGENTS.md → Deployment). GitHub secret `VLANDIVIR_2025_BOT_TOKEN` is passed into the image as `TELEGRAM_BOT_TOKEN`.

## Development

```bash
npm run start:dev        # watch mode, HTTP :3000
npm test                 # jest unit tests (*.spec.ts next to sources)
npm run lint             # eslint --fix
npm run telegram-app:dev # GTD/Mini App Vite dev server
```

Deploy: commit + push, then manually run the `deploy-production.yml` GitHub Actions workflow. Migrations are applied from the local machine (`npx prisma migrate deploy`) **before** deploying. Never run destructive Prisma commands — the DB is shared with production.
