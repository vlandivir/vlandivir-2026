# Telegram bot commands

Notes are saved automatically from any text or photo sent to the bot. Architecture and handler files: [project-overview.md](project-overview.md).

## Creating a note

Send a message or a photo caption to save a diary note for today. To store a note for a different date, start the first line with the date.

```
02.01.2025
My note text
```

Supported formats: `YYYY.MM.DD` / `YYYY-MM-DD`, `DD.MM` or `MM/DD` (current year), `DD MMMM` (Russian month names), `DD MMM YYYY` (English month names). Omit the date → today.

## Instagram reel

In a **private** chat, a message containing an Instagram reel/post link is added to the reels notebook (download + analysis) instead of becoming a diary note. Same link twice does not duplicate; a previously failed link retries.

## Commands

| Command | What it does |
|---|---|
| `/d`, `/dairy` | Notes for a date (`DD.MM.YYYY`) or the same day across years (`DD.MM` / `DD month`) |
| `/f`, `/find` | Semantic search over that chat’s notes |
| `/q`, `/ask` | Answer a question from the diary (RAG) |
| `/history` | HTML history page, secret link (messages longer than 21 characters) |
| `/s` | Serbian translation (private chats) |
| `/p`, `/phrase` | RU/EN/SR phrase translation (private) |
| `/c`, `/collage` | Collage from 3–5 photos |
| `/a` | Open the GTD Mini App |
| `/v`, `/video` | Save a video by URL (bypasses the 20 MB Bot API limit) |
| `/bar` | Distance to a known bar + static map |
| `/dl`, `/debuglog` | Export in-memory debug log |
| `/help` | Command list |
