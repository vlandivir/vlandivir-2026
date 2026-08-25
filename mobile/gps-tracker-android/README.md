# GPS Track for Android

Native Kotlin + Jetpack Compose client that records GPS tracks as GPX files on an OpenStreetMap base map. Same behaviour as [mobile/gps-tracker-ios](../gps-tracker-ios/README.md).

## What it does

- OpenStreetMap tiles via osmdroid, on-disk cache under the app cache dir
- Record / pause / resume / stop a track
- Save GPX 1.1 to app files `tracks/`
- List finished tracks, preview them on the map, delete, and share original or smoothed GPX

No backend or account — everything stays on the device. Background recording uses a location foreground service (required on Android).

## Requirements

- Android Studio (SDK 36)
- **JDK 17 or 21** for Gradle (`brew install openjdk@21`). Android Studio’s bundled JBR 25 is too new for the Android Gradle Plugin.
- Pixel / ARM emulator with **Google APIs** (not AOSP) or a physical phone
- minSdk 29

## Run

Open in Android Studio:

```bash
open -a "Android Studio" mobile/gps-tracker-android
```

In Studio: File → Settings → Build → Gradle → Gradle JDK → **21** (Homebrew `openjdk@21`), then Run.

Or from the terminal:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
cd mobile/gps-tracker-android
./gradlew :app:installDebug
```

Application id is `com.vlandivir.gpstracker`.

## Download (no USB)

On every push to `main` that touches this folder, GitHub Actions builds a signed APK and replaces the rolling release:

**https://github.com/vlandivir/vlandivir-2026/releases/download/gps-tracker-android/gps-tracker.apk**

On the phone: open the link → install. Allow unknown apps for the browser. The first GitHub build will not overlay a USB/debug install — uninstall **GPS Track** once, then use the link for updates.

Manual rebuild: Actions → **Android GPS Track APK** → Run workflow.

On first Start, Android asks for location (While using). Background / “Allow all the time” is a second prompt; the map chip opens Settings if it is still Off.

## Notes

- OSM tiles are fetched with an identifying User-Agent; only tiles you actually view are cached.
- Recording writes **raw** GPS fixes to GPX (skips invalid / >100 m accuracy). Smoothing is export-only.
- Recording does **not** auto-follow the map; tap the location button to center on yourself.
- Live and selected tracks use the same speed colour gradient as iOS and `/gpx-track-demo`.
