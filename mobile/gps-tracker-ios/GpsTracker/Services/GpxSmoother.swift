import CoreLocation
import Foundation

/// Post-process only — never applied while recording.
/// 1) Collapse GPS scribble while standing still (bus stop / traffic light).
/// 2) Drop out-and-back GPS spikes.
/// 3) Dampen cross-track wobble so a straight street stay straight (speed-agnostic).
enum GpxSmoother {
    /// Sideways jump must be at least this far (m) to count as a spike.
    static let minSpikeLengthM: CLLocationDistance = 25
    /// Chord A→C must be shorter than this fraction of each leg A→B / B→C.
    static let maxReturnFraction: Double = 0.55
    static let maxSpikePasses = 5

    /// How much sideways GPS noise to keep (0 = lock to heading, 1 = raw).
    static let crossTrackGain: Double = 0.22
    /// Blend factor when updating heading from motion (higher = turnier).
    static let headingAlpha: Double = 0.35
    /// Need this much along-track progress (m) before trusting a new heading sample.
    static let minAlongForHeadingM: CLLocationDistance = 4

    /// Standing still: window must last at least this long.
    static let dwellMinDurationS: TimeInterval = 45
    /// Path length inside the window must be at least this (m).
    static let dwellMinPathM: CLLocationDistance = 40
    /// Net displacement must stay within this (m) — otherwise you actually moved.
    static let dwellMaxNetM: CLLocationDistance = 18
    /// Path must be this many times larger than net displacement.
    static let dwellMinPathOverNet: Double = 4
    /// Average path speed must stay below this (m/s) — ~5.4 km/h.
    static let dwellMaxAvgSpeedMps: Double = 1.5
    /// Look ahead at most this long when searching for a dwell cluster.
    static let dwellLookaheadS: TimeInterval = 240

    static func smooth(segments: [[CLLocation]]) -> [[CLLocation]] {
        segments.map { smoothSegment($0) }.filter { !$0.isEmpty }
    }

    static func smoothSegment(_ raw: [CLLocation]) -> [CLLocation] {
        guard raw.count >= 2 else { return raw }

        var points = collapseStationaryWander(raw)
        for _ in 0..<maxSpikePasses {
            let cleaned = removeOutAndBackSpikes(points)
            if cleaned.count == points.count { break }
            points = cleaned
            if points.count < 3 { break }
        }

        return dampenCrossTrack(points)
    }

    // MARK: - Stationary wander (bus stop scribble)

    /// When GPS paints a knot while you stand still, keep the arrival point and
    /// jump to the leave point — drop the chaotic intermediates.
    private static func collapseStationaryWander(_ points: [CLLocation]) -> [CLLocation] {
        guard points.count >= 4 else { return points }

        var out: [CLLocation] = []
        var i = 0
        while i < points.count {
            if let end = dwellEndIndex(in: points, start: i) {
                out.append(points[i])
                i = end
                continue
            }
            out.append(points[i])
            i += 1
        }
        return out
    }

    private static func dwellEndIndex(in points: [CLLocation], start: Int) -> Int? {
        var best: Int?
        var path = 0.0
        var j = start + 1
        while j < points.count {
            let dt = points[j].timestamp.timeIntervalSince(points[start].timestamp)
            if dt > dwellLookaheadS { break }
            path += points[j - 1].distance(from: points[j])
            let net = points[start].distance(from: points[j])
            let avgSpeed = path / max(dt, 0.1)
            if dt >= dwellMinDurationS,
               path >= dwellMinPathM,
               net <= dwellMaxNetM,
               path >= net * dwellMinPathOverNet,
               avgSpeed <= dwellMaxAvgSpeedMps
            {
                best = j
            }
            j += 1
        }
        return best
    }

    // MARK: - Out-and-back spikes

    private static func removeOutAndBackSpikes(_ points: [CLLocation]) -> [CLLocation] {
        guard points.count >= 3 else { return points }

        var keep = [Bool](repeating: true, count: points.count)
        for i in 1..<(points.count - 1) {
            let a = points[i - 1]
            let b = points[i]
            let c = points[i + 1]

            let ab = a.distance(from: b)
            let bc = b.distance(from: c)
            let ac = a.distance(from: c)
            let cte = crossTrackMeters(point: b, lineStart: a, lineEnd: c)

            let farOut =
                max(ab, bc) >= minSpikeLengthM
                && cte >= minSpikeLengthM * 0.6
            let cameBack =
                ac <= ab * maxReturnFraction
                && ac <= bc * maxReturnFraction

            if farOut && cameBack {
                keep[i] = false
            }
        }

        return points.enumerated().compactMap { keep[$0.offset] ? $0.element : nil }
    }

    // MARK: - Cross-track damping

    /// Keep along-track motion; heavily damp perpendicular GPS wander.
    private static func dampenCrossTrack(_ points: [CLLocation]) -> [CLLocation] {
        guard points.count >= 2 else { return points }

        var heading = bearingRadians(from: points[0], to: points[1])
        var position = points[0]
        var out: [CLLocation] = [points[0]]

        for point in points.dropFirst() {
            let delta = localMeters(point, origin: position)
            let along = delta.y * cos(heading) + delta.x * sin(heading)
            let cross = delta.x * cos(heading) - delta.y * sin(heading)
            let crossKept = cross * crossTrackGain

            let east = along * sin(heading) + crossKept * cos(heading)
            let north = along * cos(heading) - crossKept * sin(heading)
            position = location(
                from: position,
                eastMeters: east,
                northMeters: north,
                altitude: point.altitude,
                horizontalAccuracy: point.horizontalAccuracy,
                verticalAccuracy: point.verticalAccuracy,
                timestamp: point.timestamp
            )
            out.append(position)

            if along >= minAlongForHeadingM {
                let sample = atan2(delta.x, delta.y)
                heading = lerpAngle(heading, sample, t: headingAlpha)
            }
        }

        return out
    }

    // MARK: - Geometry helpers

    private static func crossTrackMeters(
        point: CLLocation,
        lineStart: CLLocation,
        lineEnd: CLLocation
    ) -> CLLocationDistance {
        let b = localMeters(point, origin: lineStart)
        let c = localMeters(lineEnd, origin: lineStart)
        let len2 = c.x * c.x + c.y * c.y
        if len2 < 1e-6 {
            return point.distance(from: lineStart)
        }
        return abs(c.x * b.y - c.y * b.x) / sqrt(len2)
    }

    /// Local ENU-ish meters: x = east, y = north.
    private static func localMeters(
        _ location: CLLocation,
        origin: CLLocation
    ) -> (x: Double, y: Double) {
        let lat0 = origin.coordinate.latitude * .pi / 180
        let mPerDegLat = 111_320.0
        let mPerDegLon = 111_320.0 * cos(lat0)
        let x = (location.coordinate.longitude - origin.coordinate.longitude) * mPerDegLon
        let y = (location.coordinate.latitude - origin.coordinate.latitude) * mPerDegLat
        return (x, y)
    }

    private static func location(
        from origin: CLLocation,
        eastMeters: Double,
        northMeters: Double,
        altitude: CLLocationDistance,
        horizontalAccuracy: CLLocationAccuracy,
        verticalAccuracy: CLLocationAccuracy,
        timestamp: Date
    ) -> CLLocation {
        let lat0 = origin.coordinate.latitude * .pi / 180
        let mPerDegLat = 111_320.0
        let mPerDegLon = max(111_320.0 * cos(lat0), 1e-6)
        let lat = origin.coordinate.latitude + northMeters / mPerDegLat
        let lon = origin.coordinate.longitude + eastMeters / mPerDegLon
        return CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
            altitude: altitude,
            horizontalAccuracy: horizontalAccuracy,
            verticalAccuracy: verticalAccuracy,
            timestamp: timestamp
        )
    }

    /// Bearing in radians, 0 = north, clockwise toward east (atan2(east, north)).
    private static func bearingRadians(from: CLLocation, to: CLLocation) -> Double {
        let d = localMeters(to, origin: from)
        return atan2(d.x, d.y)
    }

    private static func lerpAngle(_ a: Double, _ b: Double, t: Double) -> Double {
        var delta = b - a
        while delta > .pi { delta -= 2 * .pi }
        while delta < -.pi { delta += 2 * .pi }
        return a + delta * t
    }
}
