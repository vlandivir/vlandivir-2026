# Repo map (for agents)

Read this first, then [project-overview.md](project-overview.md) only if you need controller/model detail. Access control: [authorization.md](authorization.md). Design tokens: [design-system.md](design-system.md) and [AGENTS.md](../AGENTS.md).

**What this repo is:** a personal experimental monorepo for https://vlandivir.com. New tools appear as new folders; stacks stay mixed on purpose (Nest + vanilla JS + React/Vite + SwiftUI + Tauri). Do not refactor toward one framework unless the user asks.

**What it is not:** a multi-tenant product, a clean architecture showcase, or a place to “simplify” by deleting working experiments.

## Top level

| Path | Role | Touch when… |
|---|---|---|
| `src/` | NestJS 11 backend: HTTP, Telegram webhook, Prisma, OpenAI, Spaces | APIs, bot, auth, background jobs |
| `web/` | Static pages, one folder per page, no bundler | Public UI, i18n, CSS layout |
| `telegram-app/` | React + Vite app, built into `telegram-app/dist` | GTD UI and Telegram Mini App |
| `desktop/trip-montage/` | Tauri 2 + ffmpeg | CapCut-oriented trip export |
| `mobile/gtd-ios/` | SwiftUI GTD client | iPhone GTD |
| `mobile/gps-tracker-ios/` | SwiftUI GPS → GPX, no backend | iPhone tracker |
| `prisma/` | Schema + migrations | Data model. Apply `migrate deploy` from the laptop **before** shipping code that needs it |
| `docs/` | Living docs | You are here |
| `assets/fonts/` | Noto Sans for PDF export | `/history pdf` |
| `test/` | Nest e2e harness | Rarely |
| `.github/workflows/` | Production Docker deploy (manual) | Env vars, image, SSH |
| `.cursor/rules/` | Short agent rules | Conventions |

There are **no git submodules and no nested `.git` directories**. Clients are ordinary folders in this repo, each with its own package/Xcode/Cargo project.

## How a request lands

```
Internet → droplet Docker (Nest, HTTPS :443)
  ├── static  web/<page>/          /  /places  /subs  /files  /gpx-route-png …
  ├── SPA     telegram-app/dist    /gtd  /mini-app
  ├── APIs    src/*-api.controller /map-api  /diary-api  /gtd-api  /trip-api …
  ├── bot     POST /telegram-bot   Telegraf webhook
  └── MCP     POST /mcp
```

Locally the same process listens on HTTP `:3000`. Certs and Instagram cookies are **not** in git (`.secret/`, droplet mounts).

## `web/` pages

Each page is `web/<name>/` (`index.html`, optional `app.js` / `styles.css` / `i18n.js`). Shared chrome is `web/shared/`.

| Folder | URL | Notes |
|---|---|---|
| `home/` | `/`, `/en` | Landing |
| `places/` | `/places`, `/places/point/:id`, `/places/track/:id` | Leaflet map; OG tags from `map-pages.controller.ts` |
| `diary/` | `/diary` | Google session |
| `email/` | `/email` | Google session, IMAP-backed mail UI |
| `threads/` | `/threads` | Google session; composer for @vlandivir Threads posts |
| `reels/` | `/reels` | Unlisted catalog; Google or API key |
| `subs/` | `/subs` | Vertical-video subtitles (dark workbench palette allowed) |
| `gpx-route-png/` | `/gpx-route-png` | Client-only GPX → PNG |
| `gpx-track-demo/` | `/gpx-track-demo` | GPS smoothing demo |
| `files/` | `/files` | Small files page |
| `trip/` | `/trip`, `/trip/:secret` | Shared albums |
| `shared/` | `/shared/…` | Theme, header, i18n — see AGENTS.md |

Routes are declared in `src/app.controller.ts` plus feature controllers. Adding a page: folder under `web/`, a `@Get` if it needs a pretty URL, design-system rules, `?v=` on CSS.

## `src/` (Nest)

| Area | Path |
|---|---|
| Bootstrap, HTTPS, static mounts | `src/main.ts` |
| Module wiring | `src/app.module.ts` |
| Page index routes | `src/app.controller.ts` |
| Google session / OAuth | `src/auth/` |
| Telegram bot | `src/telegram-bot/` |
| Domain logic | `src/services/` |
| One-off DB/maintenance scripts | `src/scripts/` (npm scripts in root `package.json`) |
| Generated Prisma client | `src/generated/` (gitignored; `npx prisma generate`) |

Controllers sit mostly at `src/*.controller.ts` (flat), with folders for `auth`, `gtd`, `mcp`, `mini-app`, `telegram-bot`. That mix is historical; do not reshuffle on a drive-by change.

## Clients that are not `web/`

- **telegram-app** — Vite `base` must match how Nest serves `/gtd` and `/mini-app`. Root scripts: `telegram-app:dev` / `telegram-app:build`.
- **desktop/trip-montage** — own `package.json` + `src-tauri`. Talks to prod (or localhost) with Google JWT.
- **mobile/** — open the `.xcodeproj`; do not run from Nest.

## Do not commit / do not copy to a new repo

| Path | Why |
|---|---|
| `.env`, `.secret/`, `.secret-backup/` | Secrets, TLS, cookies |
| `node_modules/`, `dist/`, `telegram-app/dist/` | Build output |
| `gpx-samples/`, `custom-images/`, `pdf/` | Local scratch |
| `--version/` | Accidental directory |
| `.dairy/`, `.data/` | Local runtime |

## Dead or leftover (safe to ignore; delete only with intent)

- Prisma models `Todo`, `Question`, `Answer`, `TaskNote`, `TaskImage`, `ChatSettings` — in the schema, unused in `src/`. Check the shared DB before dropping.
- `src/scripts/*` — one-off maintenance; keep the script, do not invent new npm wrappers without a user.
- Duplicate ESLint: only `eslint.config.js` (flat) is in use.

## Conventions agents must keep

1. Feature branch, not `main` (`.cursor/rules/work-on-feature-branch.mdc`).
2. Web CSS: tokens only (`.cursor/rules/web-design-system.mdc`).
3. New env vars in **four** places: `.env`, `Dockerfile` ARG/ENV, `deploy-production.yml` build-args, GitHub secret.
4. No Puppeteer unless the user asks.
5. Shared Postgres with production — no destructive Prisma commands.
