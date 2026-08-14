import CoreLocation
import MapKit
import UIKit

/// One overlay for a whole track; renderer paints each segment with `SpeedGradient`.
final class SpeedPathOverlay: NSObject, MKOverlay {
    let mapPoints: [MKMapPoint]
    let speedsKmh: [Double]
    let boundingMapRect: MKMapRect
    let coordinate: CLLocationCoordinate2D

    init(locations: [CLLocation]) {
        let coords = locations.map(\.coordinate)
        let points = coords.map { MKMapPoint($0) }
        self.mapPoints = points
        self.speedsKmh = SpeedGradient.displaySpeedsKmh(for: locations)

        if points.isEmpty {
            self.boundingMapRect = .null
            self.coordinate = CLLocationCoordinate2D()
        } else {
            var rect = MKMapRect(origin: points[0], size: MKMapSize(width: 0, height: 0))
            for point in points.dropFirst() {
                rect = rect.union(MKMapRect(origin: point, size: MKMapSize(width: 0, height: 0)))
            }
            self.boundingMapRect = rect
            self.coordinate = coords[coords.count / 2]
        }
        super.init()
    }
}

final class SpeedPathRenderer: MKOverlayRenderer {
    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale) {
        guard let path = overlay as? SpeedPathOverlay,
              path.mapPoints.count >= 2,
              path.speedsKmh.count == path.mapPoints.count - 1,
              let ctx = UIGraphicsGetCurrentContext()
        else { return }

        let lineWidth = max(3.5, 5.5 / zoomScale)
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
        ctx.setLineWidth(lineWidth)

        // Soft dark halo so the trail stays readable on light/dark OSM tiles.
        ctx.setStrokeColor(UIColor.black.withAlphaComponent(0.35).cgColor)
        ctx.setLineWidth(lineWidth + 2.5 / zoomScale)
        strokeAll(path, in: ctx)
        ctx.setLineWidth(lineWidth)

        for i in 0..<path.speedsKmh.count {
            let a = path.mapPoints[i]
            let b = path.mapPoints[i + 1]
            let segmentRect = MKMapRect(
                x: min(a.x, b.x),
                y: min(a.y, b.y),
                width: max(abs(b.x - a.x), 1),
                height: max(abs(b.y - a.y), 1)
            ).insetBy(dx: -lineWidth * 2, dy: -lineWidth * 2)
            guard segmentRect.intersects(mapRect) else { continue }

            ctx.setStrokeColor(SpeedGradient.color(kmh: path.speedsKmh[i]).cgColor)
            ctx.beginPath()
            ctx.move(to: point(for: a))
            ctx.addLine(to: point(for: b))
            ctx.strokePath()
        }
    }

    private func strokeAll(_ path: SpeedPathOverlay, in ctx: CGContext) {
        guard let first = path.mapPoints.first else { return }
        ctx.beginPath()
        ctx.move(to: point(for: first))
        for point in path.mapPoints.dropFirst() {
            ctx.addLine(to: self.point(for: point))
        }
        ctx.strokePath()
    }
}
