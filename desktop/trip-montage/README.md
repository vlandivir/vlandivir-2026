# Trip Montage (Tauri)

Локальный монтаж trip-альбомов для CapCut: Google auth как на сайте, ленивый кэш видео (скачать / удалить один файл / очистить весь кэш), вырезание отрезков в отдельные файлы с вставкой в линейку, export папки `01-….mp4` через системный `ffmpeg`.

## Требования

- Node 20+
- Rust (для Tauri 2)
- `ffmpeg` в `PATH`
- macOS / Linux (GUI)

## Dev

```bash
cd desktop/trip-montage
npm install
npm run tauri dev
```

По умолчанию API: `https://vlandivir.com`. Для локального бэкенда после старта можно вызвать из DevTools:

```js
await window.__TAURI__.core.invoke('set_api_base', { base: 'http://localhost:3000' })
```

(или расширить UI позже).

## Сборка

```bash
npm run tauri build
```

## Auth

1. Приложение поднимает `127.0.0.1:<port>`
2. Открывает браузер на `/auth/google?redirect=/auth/desktop-handoff?port=…`
3. После allowlist-логина сайт редиректит JWT на loopback
4. Дальше все `trip-api` / `auth/me` идут с `Authorization: Bearer`
