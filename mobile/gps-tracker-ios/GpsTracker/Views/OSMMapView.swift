import CoreLocation
import MapKit
import SwiftUI

struct OSMMapView: UIViewRepresentable {
    var userTrackingEnabled: Bool
    var liveLocations: [CLLocation]
    var selectedLocations: [CLLocation]
    var selectedTrackID: String?

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.delegate = context.coordinator
        map.showsUserLocation = true
        map.showsCompass = true
        map.pointOfInterestFilter = .excludingAll

        let overlay = CachedTileOverlay()
        context.coordinator.tileOverlay = overlay
        // Tiles replace Apple basemap; track lines must be added at the same
        // (or higher) level *after* this overlay, or they stay hidden under OSM.
        map.addOverlay(overlay, level: .aboveLabels)

        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        let mode: MKUserTrackingMode = userTrackingEnabled ? .follow : .none
        if map.userTrackingMode != mode {
            map.setUserTrackingMode(mode, animated: true)
        }

        context.coordinator.updateLivePath(on: map, locations: liveLocations)
        context.coordinator.updateSelectedPath(
            on: map,
            locations: selectedLocations,
            trackID: selectedTrackID
        )
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var tileOverlay: CachedTileOverlay?
        private var liveOverlay: SpeedPathOverlay?
        private var selectedOverlay: SpeedPathOverlay?
        private var fittedTrackID: String?

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let tile = overlay as? MKTileOverlay {
                return MKTileOverlayRenderer(tileOverlay: tile)
            }
            if overlay is SpeedPathOverlay {
                return SpeedPathRenderer(overlay: overlay)
            }
            return MKOverlayRenderer(overlay: overlay)
        }

        func updateLivePath(on map: MKMapView, locations: [CLLocation]) {
            if let existing = liveOverlay {
                map.removeOverlay(existing)
                liveOverlay = nil
            }
            guard locations.count >= 2 else { return }

            let overlay = SpeedPathOverlay(locations: locations)
            liveOverlay = overlay
            map.addOverlay(overlay, level: .aboveLabels)
        }

        func updateSelectedPath(
            on map: MKMapView,
            locations: [CLLocation],
            trackID: String?
        ) {
            if let existing = selectedOverlay {
                map.removeOverlay(existing)
                selectedOverlay = nil
            }

            guard let trackID, locations.count >= 2 else {
                fittedTrackID = nil
                return
            }

            let overlay = SpeedPathOverlay(locations: locations)
            selectedOverlay = overlay
            map.addOverlay(overlay, level: .aboveLabels)

            if fittedTrackID != trackID {
                fittedTrackID = trackID
                let rect = overlay.boundingMapRect.insetBy(dx: -800, dy: -800)
                map.setVisibleMapRect(
                    rect,
                    edgePadding: UIEdgeInsets(top: 80, left: 40, bottom: 140, right: 40),
                    animated: true
                )
            }
        }
    }
}
