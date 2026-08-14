import CoreLocation
import Foundation
import SwiftData

@MainActor
final class LocationRecorder: NSObject, ObservableObject {
    enum State: String {
        case idle
        case recording
        case paused
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var activeTrack: Track?
    @Published private(set) var liveLocations: [CLLocation] = []
    @Published private(set) var distanceM: Double = 0
    @Published private(set) var pointCount: Int = 0
    @Published private(set) var authorizationStatus: CLAuthorizationStatus
    @Published var lastError: String?

    private let manager = CLLocationManager()
    private var modelContext: ModelContext?
    private var segments: [[CLLocation]] = []
    private var currentSegment: [CLLocation] = []
    private var lastLocation: CLLocation?
    private var pointsSinceFlush = 0
    /// iOS shows Once / While Using first; Always is a second upgrade prompt.
    private var shouldRequestAlwaysUpgrade = false

    /// Drop only clearly invalid fixes. No speed/EMA while recording — raw GPX is source of truth.
    private let maxHorizontalAccuracy: CLLocationAccuracy = 100

    enum ShareVariant: String {
        case original
        case smoothed
    }

    /// True when iOS granted Always — required for background track updates.
    var isBackgroundRecordingEnabled: Bool {
        authorizationStatus == .authorizedAlways
    }

    var authorizationLabel: String {
        switch authorizationStatus {
        case .authorizedAlways:
            return "Always"
        case .authorizedWhenInUse:
            return "While Using"
        case .denied, .restricted:
            return "Denied"
        case .notDetermined:
            return "Not set"
        @unknown default:
            return "Unknown"
        }
    }

    override init() {
        authorizationStatus = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        // Deliver every fix; append writes raw points (smoothing is export-only).
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = false
        manager.showsBackgroundLocationIndicator = false
    }

    func attach(modelContext: ModelContext) {
        self.modelContext = modelContext
        recoverInterruptedTrackIfNeeded()
    }

    func requestAuthorization() {
        switch manager.authorizationStatus {
        case .notDetermined:
            // First dialog is only Once / While Using — that is normal on modern iOS.
            shouldRequestAlwaysUpgrade = true
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            // Direct upgrade attempt (no pending flag — avoids re-prompt loops).
            manager.requestAlwaysAuthorization()
        default:
            break
        }
    }

    func start() {
        lastError = nil
        guard state == .idle else { return }
        guard let modelContext else {
            lastError = "Store is not ready."
            return
        }

        let status = manager.authorizationStatus
        if status == .notDetermined {
            requestAuthorization()
            lastError = "Allow location access, then tap Start again."
            return
        }
        if status == .authorizedWhenInUse {
            // Second system prompt: Keep While Using / Change to Always Allow.
            requestAuthorization()
        }
        guard status == .authorizedAlways || status == .authorizedWhenInUse else {
            lastError = "Location permission is required. Enable it in Settings → GPS Track."
            return
        }

        let startedAt = Date()
        let name = Self.defaultName(for: startedAt)
        let id = UUID().uuidString
        let fileName = "\(id).gpx"
        let track = Track(
            id: id,
            name: name,
            startedAt: startedAt,
            status: "recording",
            gpxFileName: fileName
        )
        modelContext.insert(track)
        try? modelContext.save()

        segments = []
        currentSegment = []
        lastLocation = nil
        liveLocations = []
        distanceM = 0
        pointCount = 0
        pointsSinceFlush = 0
        activeTrack = track
        state = .recording

        beginLocationUpdates()
        flushGPX()
    }

    func pause() {
        guard state == .recording, let track = activeTrack else { return }
        if !currentSegment.isEmpty {
            segments.append(currentSegment)
            currentSegment = []
        }
        lastLocation = nil
        track.status = "paused"
        try? modelContext?.save()
        state = .paused
        endLocationUpdates()
        flushGPX()
    }

    func resume() {
        guard state == .paused, let track = activeTrack else { return }
        lastLocation = nil
        track.status = "recording"
        try? modelContext?.save()
        state = .recording
        beginLocationUpdates()
    }

    func stop() {
        guard state == .recording || state == .paused, let track = activeTrack else { return }
        if !currentSegment.isEmpty {
            segments.append(currentSegment)
            currentSegment = []
        }
        endLocationUpdates()
        track.status = "finished"
        track.endedAt = Date()
        track.distanceM = distanceM
        track.pointCount = pointCount
        try? modelContext?.save()
        flushGPX()

        activeTrack = nil
        state = .idle
        liveLocations = []
        distanceM = 0
        pointCount = 0
        segments = []
        lastLocation = nil
    }

    func delete(_ track: Track) {
        if activeTrack?.id == track.id {
            stop()
        }
        if let url = try? GpxWriter.fileURL(fileName: track.gpxFileName) {
            try? FileManager.default.removeItem(at: url)
        }
        modelContext?.delete(track)
        try? modelContext?.save()
    }

    func shareFileURL(for track: Track, variant: ShareVariant = .original) -> URL? {
        guard let source = try? GpxWriter.fileURL(fileName: track.gpxFileName),
              FileManager.default.fileExists(atPath: source.path)
        else { return nil }

        let niceName = Self.shareFileName(for: track, variant: variant)
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent(niceName)
        try? FileManager.default.removeItem(at: dest)

        do {
            switch variant {
            case .original:
                try FileManager.default.copyItem(at: source, to: dest)
            case .smoothed:
                let raw = GpxWriter.parseLocations(from: source)
                let smoothed = GpxSmoother.smooth(segments: [raw])
                let xml = GpxWriter.buildXML(
                    name: "\(track.name) (smoothed)",
                    startedAt: track.startedAt,
                    segments: smoothed
                )
                try xml.write(to: dest, atomically: true, encoding: .utf8)
            }
            return dest
        } catch {
            lastError = "Could not prepare share file."
            return nil
        }
    }

    func locations(for track: Track, variant: ShareVariant = .original) -> [CLLocation] {
        if activeTrack?.id == track.id {
            return liveLocations
        }
        guard let url = try? GpxWriter.fileURL(fileName: track.gpxFileName) else { return [] }
        let raw = GpxWriter.parseLocations(from: url)
        switch variant {
        case .original:
            return raw
        case .smoothed:
            return GpxSmoother.smooth(segments: [raw]).flatMap { $0 }
        }
    }

    private func beginLocationUpdates() {
        // Background updates require Always; With While Using we still record in foreground.
        let always = manager.authorizationStatus == .authorizedAlways
        manager.allowsBackgroundLocationUpdates = always
        manager.showsBackgroundLocationIndicator = always
        manager.startUpdatingLocation()
    }

    private func endLocationUpdates() {
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        manager.showsBackgroundLocationIndicator = false
    }

    private func handleAuthorizationChange(_ status: CLAuthorizationStatus) {
        authorizationStatus = status
        if status == .authorizedWhenInUse, shouldRequestAlwaysUpgrade {
            shouldRequestAlwaysUpgrade = false
            manager.requestAlwaysAuthorization()
        }
        if status == .authorizedAlways {
            shouldRequestAlwaysUpgrade = false
            if state == .recording {
                manager.allowsBackgroundLocationUpdates = true
                manager.showsBackgroundLocationIndicator = true
            }
        }
    }

    private func append(_ location: CLLocation) {
        guard state == .recording else { return }
        // Keep raw trail: only skip broken / absurdly bad fixes.
        if location.horizontalAccuracy < 0 || location.horizontalAccuracy > maxHorizontalAccuracy {
            return
        }

        if let last = lastLocation {
            distanceM += location.distance(from: last)
        }

        currentSegment.append(location)
        lastLocation = location
        liveLocations.append(location)
        pointCount += 1
        pointsSinceFlush += 1

        activeTrack?.distanceM = distanceM
        activeTrack?.pointCount = pointCount

        if pointsSinceFlush >= 10 {
            pointsSinceFlush = 0
            try? modelContext?.save()
            flushGPX()
        }
    }

    private func flushGPX() {
        guard let track = activeTrack else { return }
        var all = segments
        if !currentSegment.isEmpty {
            all.append(currentSegment)
        }
        do {
            try GpxWriter.write(
                fileName: track.gpxFileName,
                name: track.name,
                startedAt: track.startedAt,
                segments: all
            )
        } catch {
            lastError = "Failed to write GPX: \(error.localizedDescription)"
        }
    }

    private func recoverInterruptedTrackIfNeeded() {
        guard let modelContext else { return }
        let descriptor = FetchDescriptor<Track>(
            predicate: #Predicate { $0.status == "recording" || $0.status == "paused" }
        )
        guard let openTracks = try? modelContext.fetch(descriptor), !openTracks.isEmpty else { return }

        // Finish interrupted sessions so on-disk GPX stays the source of truth.
        for track in openTracks {
            track.status = "finished"
            if track.endedAt == nil {
                track.endedAt = Date()
            }
        }
        try? modelContext.save()
        activeTrack = nil
        state = .idle
        liveLocations = []
        segments = []
        currentSegment = []
        lastLocation = nil
        distanceM = 0
        pointCount = 0
    }

    private static func defaultName(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return "Track \(formatter.string(from: date))"
    }

    static func shareFileName(for track: Track, variant: ShareVariant = .original) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB_POSIX")
        formatter.dateFormat = "yyyy-MM-dd_HH-mm"
        let stamp = formatter.string(from: track.startedAt)
        switch variant {
        case .original:
            return "Track_\(stamp).gpx"
        case .smoothed:
            return "Track_\(stamp)_smoothed.gpx"
        }
    }
}

extension LocationRecorder: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.handleAuthorizationChange(status)
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        Task { @MainActor in
            for location in locations {
                self.append(location)
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.lastError = error.localizedDescription
        }
    }
}
