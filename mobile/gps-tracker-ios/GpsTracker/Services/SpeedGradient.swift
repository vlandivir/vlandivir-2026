import CoreLocation
import UIKit

/// Speed → color stops shared with the web demo (`web/gpx-track-demo`).
/// Low range is stretched so 5 / 15 / 25 km/h read as different colors.
enum SpeedGradient {
    struct Stop {
        let kmh: Double
        let color: UIColor
    }

    /// Stops (km/h): walk / slow transit contrast first, then car/MTB tail.
    static let stops: [Stop] = [
        Stop(kmh: 0, color: UIColor(red: 0.086, green: 0.639, blue: 0.290, alpha: 1)), // #16a34a
        Stop(kmh: 5, color: UIColor(red: 0.133, green: 0.773, blue: 0.369, alpha: 1)), // #22c55e
        Stop(kmh: 15, color: UIColor(red: 0.635, green: 0.839, blue: 0.133, alpha: 1)), // #a2d622
        Stop(kmh: 25, color: UIColor(red: 0.918, green: 0.702, blue: 0.031, alpha: 1)), // #eab308
        Stop(kmh: 50, color: UIColor(red: 0.976, green: 0.451, blue: 0.086, alpha: 1)), // #f97316
        Stop(kmh: 90, color: UIColor(red: 0.937, green: 0.267, blue: 0.267, alpha: 1)), // #ef4444
        Stop(kmh: 140, color: UIColor(red: 0.659, green: 0.333, blue: 0.969, alpha: 1)), // #a855f7
        Stop(kmh: 200, color: .black),
    ]

    /// Display-only: ignore tiny Δt (duplicate fixes).
    static let minSegmentDurationS: TimeInterval = 0.35
    /// Rolling median half-window (total width = 2*r+1).
    static let medianRadius = 2
    /// Max |Δv| between consecutive display samples (m/s²). ~human/transit jerk.
    static let maxAccelerationMps2: Double = 3.5

    static func color(kmh: Double) -> UIColor {
        let v = max(0, kmh)
        if v <= stops[0].kmh { return stops[0].color }
        for i in 1..<stops.count {
            let a = stops[i - 1]
            let b = stops[i]
            if v <= b.kmh {
                let t = (v - a.kmh) / (b.kmh - a.kmh)
                return lerp(a.color, b.color, t: t)
            }
        }
        return stops.last!.color
    }

    /// Instantaneous Δs/Δt (km/h). Gaps without usable time → 0.
    static func segmentSpeedKmh(from: CLLocation, to: CLLocation) -> Double {
        let dt = to.timestamp.timeIntervalSince(from.timestamp)
        guard dt >= minSegmentDurationS else { return 0 }
        let meters = to.distance(from: from)
        return (meters / dt) * 3.6
    }

    /// Speeds for map coloring: median + acceleration clamp.
    /// Does not mutate recorded GPX — display only.
    static func displaySpeedsKmh(for locations: [CLLocation]) -> [Double] {
        let raw = speedsKmh(for: locations)
        guard !raw.isEmpty else { return [] }

        let medians = rollingMedian(raw, radius: medianRadius)
        return clampAcceleration(medians, locations: locations)
    }

    static func speedsKmh(for locations: [CLLocation]) -> [Double] {
        guard locations.count >= 2 else { return [] }
        var out: [Double] = []
        out.reserveCapacity(locations.count - 1)
        for i in 1..<locations.count {
            // Prefer CoreLocation's filtered speed on the newer fix when present.
            let device = locations[i].speed
            if device >= 0 {
                out.append(device * 3.6)
            } else {
                out.append(segmentSpeedKmh(from: locations[i - 1], to: locations[i]))
            }
        }
        return out
    }

    private static func rollingMedian(_ values: [Double], radius: Int) -> [Double] {
        guard radius > 0, values.count > 1 else { return values }
        return values.indices.map { i in
            let lo = max(0, i - radius)
            let hi = min(values.count - 1, i + radius)
            let window = Array(values[lo...hi]).sorted()
            return window[window.count / 2]
        }
    }

    private static func clampAcceleration(_ speedsKmh: [Double], locations: [CLLocation]) -> [Double] {
        guard speedsKmh.count >= 2 else { return speedsKmh }
        var out = speedsKmh
        for i in 1..<out.count {
            let dt = locations[i + 1].timestamp.timeIntervalSince(locations[i].timestamp)
            guard dt >= minSegmentDurationS else {
                out[i] = out[i - 1]
                continue
            }
            let prev = out[i - 1] / 3.6
            let curr = out[i] / 3.6
            let maxDelta = maxAccelerationMps2 * dt
            let clamped = min(max(curr, prev - maxDelta), prev + maxDelta)
            out[i] = max(0, clamped * 3.6)
        }
        return out
    }

    private static func lerp(_ a: UIColor, _ b: UIColor, t: Double) -> UIColor {
        var ar: CGFloat = 0, ag: CGFloat = 0, ab: CGFloat = 0, aa: CGFloat = 0
        var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
        a.getRed(&ar, green: &ag, blue: &ab, alpha: &aa)
        b.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        let u = CGFloat(max(0, min(1, t)))
        return UIColor(
            red: ar + (br - ar) * u,
            green: ag + (bg - ag) * u,
            blue: ab + (bb - ab) * u,
            alpha: aa + (ba - aa) * u
        )
    }
}
