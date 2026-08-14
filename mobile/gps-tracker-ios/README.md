# GPS Track for iPhone

Native SwiftUI app that records GPS tracks as GPX files on an OpenStreetMap base map.

## What it does

- OpenStreetMap tiles via MapKit (`MKTileOverlay`), with on-disk tile cache under `Library/Caches/osm-tiles`
- Record / pause / resume / stop a track
- Save GPX 1.1 to `Documents/tracks/`
- List finished tracks, preview them on the map, delete, and share original or smoothed GPX (AirDrop / Messages / Save to Files)

No backend or account — everything stays on the device.

## Requirements

- Mac with **Xcode 15+** (iOS 17 SDK)
- Apple ID (free provisioning works ~7 days) or Apple Developer Program
- Physical iPhone recommended (Simulator GPS is limited)

## Install on your phone

1. Open the project:
   ```bash
   open mobile/gps-tracker-ios/GpsTracker.xcodeproj
   ```
2. Select the **GpsTracker** target → **Signing & Capabilities**:
   - Enable **Automatically manage signing**
   - Choose your Team
   - Bundle ID is `com.vlandivir.gpstracker`
3. Plug in the iPhone, trust the computer, select the device, press **Run**.
4. On first Start, iOS shows **Once** / **While Using the App** (there is no Always yet — that is normal). Choose **While Using**. A second prompt may offer **Change to Always Allow** for background recording; you can also set it later in Settings → GPS Track → Location → Always.

## Project layout

```
mobile/gps-tracker-ios/
  GpsTracker.xcodeproj/
  GpsTracker/
    GpsTrackerApp.swift
    Info.plist
    Models/Track.swift
    Services/          # LocationRecorder, GpxWriter, TileCacheOverlay
    Views/             # Map, track list, share button
    Assets.xcassets/
  README.md
```

## Notes

- OSM tiles are fetched with an identifying User-Agent; only tiles you actually view are cached (no bulk region download yet).
- Recording writes **raw** GPS fixes to GPX (only skips invalid / >100 m accuracy). No speed filter or EMA while recording — safe for MTB and cars (~140 km/h).
- Recording does **not** auto-follow the map; tap the location button to center on yourself.
- Open a saved track to preview it; use **Original / Smoothed** to switch the on-map path (same post-process as share).
- Live and selected tracks are drawn with a **speed color gradient** stretched at low speeds (0 / 5 / 15 / 25 / 50 / 90 / 140 / 200 km/h). Map coloring uses a display-only median + acceleration clamp so cold-start GPS jumps do not paint as 70+ km/h. Same scale as `/gpx-track-demo`.
- Share menu offers **original** and **smoothed** GPX. Smoothing is post-process only: collapse standing-still GPS scribble, drop out-and-back spikes, then dampen cross-track wobble relative to heading. Speed is unused for filtering — safe for cars at ~140 km/h.
- The top chip shows **Background On/Off** from location auth (`Always` required for background). Tap it to open Settings if Off.
- If the app is killed mid-recording, the open track is marked finished on next launch using the last flushed GPX.
