# Project Agent Rules

This is a **personal experimental monorepo** for https://vlandivir.com. NestJS, vanilla `web/` pages, a React/Vite app, SwiftUI, and Tauri all live together on purpose — do not unify the stacks.

**Orientation (in this order):**

1. [docs/repo-map.md](docs/repo-map.md) — folders, what to touch, what not to copy
2. [docs/project-overview.md](docs/project-overview.md) — controllers, bot, data model
3. [docs/authorization.md](docs/authorization.md) — who can hit which routes; keep it updated when touching guards or keys

Bot command examples: [docs/telegram-bot.md](docs/telegram-bot.md). Planned GitHub move without history: [docs/migrate-to-new-repo.md](docs/migrate-to-new-repo.md).

- Do not run Puppeteer in this repository. For frontend checks, use simpler static/HTTP verification unless the user explicitly asks otherwise.

## Design system (web pages)

All public pages under `web/` share one visual language, defined by `web/shared/site-theme.css` (shadcn-style HSL tokens + shared component styling). The full contract is documented in [docs/design-system.md](docs/design-system.md). Page CSS must be **layout-only**: no palettes, no hardcoded colors, no font stacks. The site follows `prefers-color-scheme`; both light and dark themes must remain usable.

### Tokens (the only allowed sources of color/spacing/type)

- Surfaces: `hsl(var(--background))` page, `hsl(var(--card))` panels, `hsl(var(--shadcn-muted))` soft fills, `hsl(var(--popover))` dropdowns.
- Text: `var(--v-text)` main, `var(--v-muted)` secondary, `hsl(var(--primary-foreground))` on filled-primary.
- Borders: `hsl(var(--shadcn-border))`; form inputs `hsl(var(--shadcn-input))`; focus ring `hsl(var(--shadcn-ring))`.
- Accents: `hsl(var(--primary))` (actions/links/progress), `hsl(var(--destructive))` (errors, warm highlights like the Instagram icon). Tints via alpha: `hsl(var(--primary) / 0.1)`.
- Success: `hsl(var(--success))` with `hsl(var(--success-foreground))` for completed/positive actions.
- Spacing scale `--v-space-1` (4px) … `--v-space-8` (64px); page/panel/card paddings `--v-section-padding` / `--v-panel-padding` / `--v-card-padding`.
- Radius `var(--radius)` (nested elements `calc(var(--radius) - 2px)`); shadows `var(--v-shadow)` (cards) and `var(--shadcn-popover-shadow)` (popovers/modals).
- Fonts: `var(--font-sans)` (Source Sans 3) for UI, `var(--font-display)` (Source Serif 4) for titles/brand, `var(--font-mono)` for code.
- Home tool sketches: same girl, new composition each time — [`.cursor/skills/home-tool-sketches/SKILL.md`](.cursor/skills/home-tool-sketches/SKILL.md). 
- Legacy aliases (`--page`, `--paper`, `--ink`, `--line`, `--accent`, `--green`…) exist in the theme for old code; don't use them in new CSS and never redefine them in a page `:root`.

**Allowed hardcoded colors (the only exceptions):** overlays above photos/video (`rgba(0,0,0,.5)`, white text on them), dark letterbox backdrops behind media (`#000`), brand gradients (Instagram button), colors that are literal data (subtitle/route color options the user picks, canvas-rendering colors in JS — those also may keep their own fonts, e.g. Montserrat/Satoshi in the GPX PNG generator output), and the dark video-editor workbench palette in subs (`--charcoal`/`--coral`/`--yellow`/`--blue`).

### Components — reuse, don't reinvent

- Cards/panels: `.editor-card` (card padding), `.tool-block`/`.workflow-step`/`.archive-section` (section padding). All get border+radius+surface+shadow from the theme.
- Buttons: `.primary-btn` (filled), `.ghost-btn`/`.mini-btn`/`.tool-link` (outlined, min-height 40px, font-weight 750). Icon-only: add `.icon-btn`.
- Kickers: `.eyebrow`/`.section-kicker` (uppercase 12–13px, themed color); page width wrappers: `.page-shell`/`.shell`/`.container` (min(1160px, 100% − gutters)).
- Inputs/selects/textareas get full chrome from the theme (`border`, `min-height: 40px`, horizontal padding, `font: inherit`). Do not re-declare those in page CSS except layout extras (`width`, `resize`, denser toolbars). Same for buttons: padding comes from the theme — page CSS must not restyle `.primary-btn` / `.ghost-btn` / `.mini-btn` colors or padding.
- Badges/chips: `.badge`, `.meta-chip` (pill, `--secondary` fill).

### Page anatomy

- Content pages (home, files, gpx, subs): shared header `<header data-site-header data-active="..." data-lang-ru="..." data-lang-en="...">` + `/shared/site-header.css` + `/shared/site-header.js`.
- **Localization is one file per page via `/shared/i18n.js` — do NOT create `en.html` duplicates.** The RU text stays inline as the default (page works without JS, no RU flash); the runtime swaps to EN when the language is EN. Language is detected from `?lang=`, the `/en` path segment, or `<html lang>` (see the header of `/shared/i18n.js`). Mark up strings with `data-i18n="key"` (text) and `data-i18n-attr="content:key; href:key; aria-label:key"` (attributes, incl. `data-*` consumed by other scripts). Ship the dictionary as a co-located `/<page>/i18n.js` that sets `window.PAGE_I18N = { ru: {...}, en: {...} }`. Load `/<page>/i18n.js` then `/shared/i18n.js` **before** any script that reads the language or translated DOM (site-header.js, page `app.js`, `video-upload-block.js`), **without** `defer` — first in `<head>`, or first among end-of-`<body>` scripts if the page keeps its scripts there. Page `app.js` reads `document.documentElement.lang` (or `window.SITE_LANG` / `window.SiteI18n.t`) for strings it generates dynamically. The server serves the same `index.html` for `/x` and `/x/en` (see `AppController`).
- App-like pages (places — fullscreen map, reels — unlisted catalog) skip the big header and use a compact `.panel-brand` link to `/` instead.
- **The header width is shared and must never be overridden per page.** It comes from `/shared/site-header.css` (`.v-site-header` → `min(1180px, …)`) so the header looks identical on every page. Do NOT add a page-specific `width` to `.v-site-header` (that is exactly what made the subs header look wrong). The page body defaults to the theme wrapper width (`.page-shell`/`main`/`.container`/`.shell` → `min(1160px, 100% − gutters)`). A content-heavy tool page MAY widen its own body when the standard width is too cramped — e.g. `subs` sets `.subs-page main { width: min(1480px, …) }` for its side-by-side editor — but only the body, never the header (the header intentionally stays narrower than the wide body there).
- Stylesheet link order on existing legacy pages is `page styles → site-theme.css` (the theme intentionally loads **last** as an override layer). New pages should do the opposite, clean pattern: `site-theme.css → page styles`, where page styles only add layout. Either way the rule is the same: the theme owns all colors.
- Every stylesheet link carries a cache-busting query `?v=YYYYMMDD-N` — bump it whenever you change that file.

### Checklist when touching a page

1. No new hex/rgb colors in page CSS (except the allowed list above); run `grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' <file>` and justify every hit.
2. No `:root` palette overrides, no `font-family` other than the tokens.
3. Reused theme component classes before adding custom ones.
4. Bumped `?v=` on changed CSS.
5. Never override `.v-site-header` width per page (the header must match every other page); only widen a page body (`main`) when a tool genuinely needs it.
6. Screenshot the page (dev server + browser preview) and compare against home/places for consistency.

### My places map page (`web/places/`)

- Desktop (≥900px): split screen — Leaflet map on the left, a scrollable side panel (~50%, max 760px) on the right. All feature info (title, description, large Instagram embed, actions), search and the recent list live in the panel; the map itself has no Leaflet popups for saved features (only for draft markers).
- Mobile (<900px): the panel becomes a right-side drawer (`.side-panel.open` slides it in over a dimmed overlay); a floating 📋 button on the map opens it, ✕ or the overlay closes it. Selecting a feature on the map opens the drawer.
- Selection state drives everything: `selectFeature()` renders the details panel, syncs the shareable URL and highlights selected tracks.
- Share URLs are path-based: `/places/point/<id>` and `/places/track/<id>`. `MapPagesController` (src/map-pages.controller.ts) serves these paths server-side with per-feature Open Graph tags injected into index.html; the SPA then reads the path and selects the feature. Legacy `#p=<id>`/`#t=<id>` hashes still work client-side.
- Instagram metadata (author, date, counters, caption, cover) is cached in the `instagramMeta` JSONB column and refreshed at most once a day via `POST /map-api/{points|tracks}/:id/instagram-meta` (triggered when a feature is opened). Covers are copied to DO Spaces under `places/covers/{kind}-{id}.jpg` because Instagram CDN URLs expire.

## Deployment

Production (https://vlandivir.com) deploys via GitHub Actions.

- Workflow: `.github/workflows/deploy-production.yml`, manual trigger only (`workflow_dispatch`) — run it from the Actions tab or with `gh workflow run deploy-production.yml`. Deploys the pushed state of the repo, so commit and push first.
- The workflow builds the Docker image (multi-stage: prisma generate → telegram-app Vite build → nest build), pushes it to the DigitalOcean registry, then over SSH restarts the container on the droplet. TLS certs are mounted from the host (`/etc/letsencrypt/live/vlandivir.com/`).
- All runtime secrets are baked in as Docker build-args from GitHub repo secrets (`gh secret list --repo vlandivir/vlandivir-2025`). When code starts using a new env var: add it to `.env` locally, to the `ARG`/`ENV` pairs in `Dockerfile`, to `build-args` in `deploy-production.yml`, and create the GitHub secret (`gh secret set NAME`).
- Database: DigitalOcean managed Postgres, shared between local dev and prod. Trusted sources allow **only the production droplet** (not the public internet, not the laptop IP). The prod container still uses the connection string baked into the image; local `.env` uses `127.0.0.1:25060` via an SSH tunnel.
- **Local DB access:** in a separate terminal run `ssh -N vlandivir-db` (host alias in `~/.ssh/config`, LocalForward to the private DB hostname) and leave it open. Then `npx prisma migrate deploy`, `npx prisma studio`, `npm run start:dev`, and `src/scripts/*` work as before. `npx prisma generate` does not need the tunnel. If Prisma says it can't reach the database, start the tunnel — do **not** add IPs to trusted sources (the laptop has no static IP).
- Migrations are not run during deploy; apply them from the local machine with `npx prisma migrate deploy` **before** deploying code that needs them (tunnel must be up). Never run `prisma migrate reset` or other destructive commands against this database.

## Cursor Cloud specific instructions

Standard commands live in `docs/project-overview.md` (Development section) and `package.json` scripts; the notes below are the non-obvious caveats for this environment.

- **Dependencies auto-refresh on startup** via the update script (`npm ci`, `npm ci --prefix telegram-app`, `npx prisma generate`). The Prisma client is generated into `src/generated/prisma-client` and is required for lint/test/build/typecheck. Native modules `canvas`/`sharp` and `ffmpeg` are already provided by the VM image; `yt-dlp` is **not** installed (only reels/Instagram download needs it).
- **The backend cannot boot without real secrets.** `npm run start:dev` throws during module init unless these are all set: `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `VLANDIVIR_2025_WEBHOOK_URL` (also triggers a live Telegram `setWebhook`, so it needs a valid token + public HTTPS URL), plus a reachable `POSTGRES_CONNECTION_STRING` and `DO_SPACES_ACCESS_KEY`/`DO_SPACES_SECRET_KEY` (S3 `headBucket` on boot). These are personal-server credentials; add them as Cloud Agent secrets to run the full NestJS app/bot/APIs. Reminder: the DB is shared with production — never run destructive Prisma commands. Cloud VMs are **not** in Postgres trusted sources and have no `vlandivir-db` tunnel unless the user created one there; Cloud agents should not run migrate / `start:dev` against this database.
- **You can exercise the client-side apps without any secrets.** The `web/` apps (`gpx-route-png` is fully client-side; also `home`, `places`, `subs`, `files`) are static files normally served by Nest. To run them standalone, serve the repo `web/` directory from its root, e.g. `python3 -m http.server 3000` run from `web/` — they use absolute asset paths (`/shared/...`, `/gpx-route-png/...`) so must be served from the `web/` root, not a subdirectory. The `gpx-route-png` tool has a bundled `sample.gpx` (and a "Загрузить пример sample.gpx" button) for a quick end-to-end render check.
- **Telegram Mini App dev server:** `npm run telegram-app:dev` serves the React/Vite app at `http://localhost:5173/`, but it fetches `/api/user` (proxied to backend `/mini-app-api/user`), so real profile data requires the backend (and thus secrets); without it the UI shows an error state. The Telegram Mini App lives in `telegram-app/` (separate from `web/` pages).
- `npm run lint` runs `eslint --fix`, which mutates files in place.
