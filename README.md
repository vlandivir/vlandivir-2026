# vlandivir-2025

Personal experimental playground behind [vlandivir.com](https://vlandivir.com). One NestJS process serves a Telegram diary bot, REST APIs, and several small web apps. Native iOS and a Tauri desktop tool live in the same repo. Mixed stacks are intentional — do not unify them.

| | |
|---|---|
| Live site | https://vlandivir.com |
| GitHub | https://github.com/vlandivir/vlandivir-2025 |
| For agents | [docs/repo-map.md](docs/repo-map.md) · [AGENTS.md](AGENTS.md) |
| Architecture | [docs/project-overview.md](docs/project-overview.md) |
| Who can access what | [docs/authorization.md](docs/authorization.md) |
| Bot commands | [docs/telegram-bot.md](docs/telegram-bot.md) |
| Move to a new repo | [docs/migrate-to-new-repo.md](docs/migrate-to-new-repo.md) |

## Layout

```
src/             NestJS server, Telegram bot, APIs
web/             static HTML/JS/CSS pages (no bundler)
telegram-app/    React + Vite — GTD web app and Telegram Mini App
desktop/         Tauri — Trip Montage
mobile/          SwiftUI — GTD iPhone app, GPS tracker
prisma/          schema + migrations (shared prod DB)
docs/            living docs for humans and agents
```

## Run

Needs a real `.env` (Postgres, Telegram, Spaces, OpenAI). The database is shared with production — never `prisma migrate reset`.

```bash
npm install
npm install --prefix telegram-app
npx prisma generate
npm run start:dev          # Nest on :3000
npm run telegram-app:dev   # Vite on :5173 (GTD / Mini App)
npm test
```

Static pages under `web/` can be served alone (`python3 -m http.server 3000` from `web/`) without secrets.

Deploy is manual: push, then run `.github/workflows/deploy-production.yml`. Details in [AGENTS.md](AGENTS.md).
