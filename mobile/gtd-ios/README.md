# GTD for iPhone

Native SwiftUI client for the same GTD workspace as [https://vlandivir.com/gtd](https://vlandivir.com/gtd) and the Telegram Mini App (`/a`).

## What it does

- Sign in with Google (allowlisted account) via `ASWebAuthenticationSession` → `/auth/native-handoff` → JWT in Keychain
- Calls `/gtd-api` with `Authorization: Bearer <jwt>`
- One-current-task UI: scopes (all / inbox / today / project), complete / snooze / rotate / cancel
- Create & edit tasks, manage projects, browse archive
- Offline: SwiftData cache of ACTIVE tasks + projects; mutation outbox; SyncEngine pushes then pulls (`GET /gtd-api/tasks`, `GET /gtd-api/projects`)

Task images are fetched from `/gtd-api/attachments/:id` with the Google JWT (online). Attachment metadata is cached in SwiftData so the current task still knows which photos to load after a local refresh. Upload stays on the web / Telegram app for now.

## Requirements

- Mac with **Xcode 15+** (iOS 17 SDK)
- Apple ID (free provisioning works ~7 days) or Apple Developer Program for longer / TestFlight
- Physical iPhone (recommended) or Simulator
- Deployed backend with Google auth enabled (`ALLOWED_GOOGLE_EMAILS` includes your account)

## Install on your phone

1. Open `Gtd.xcodeproj` in Xcode:
   ```bash
   open mobile/gtd-ios/Gtd.xcodeproj
   ```
2. Select the **Gtd** target → **Signing & Capabilities**:
   - Enable **Automatically manage signing**
   - Choose your Team (Apple ID)
   - Bundle ID is `com.vlandivir.gtd` (change if Xcode complains about uniqueness)
3. Plug in the iPhone, trust the computer, select the device as run destination.
4. Press **Run** (▶). On first launch, Settings → General → VPN & Device Management → trust the developer cert.
5. In the app: **Sign in with Google** with the allowlisted account.

URL scheme `vlandivir-gtd://` is registered in `Gtd/Info.plist` for the OAuth bounce.

## Project layout

```
mobile/gtd-ios/
  Gtd.xcodeproj/
  Gtd/
    GtdApp.swift          # entry + SwiftData container
    Info.plist            # URL scheme, portrait iPhone
    Models/               # API DTOs + SwiftData entities
    Services/             # Auth, API, SyncEngine, store
    Views/                # Login, home, editors, settings
    Assets.xcassets/
  README.md
```

## Notes

- API base URL is hard-coded to `https://vlandivir.com` in `APIConfig` (`Gtd/Models/APIModels.swift`). Point it at a tunnel/local host only for debugging.
- After backend deploy, native handoff and sync list endpoints must be live before first login/sync works against production.
