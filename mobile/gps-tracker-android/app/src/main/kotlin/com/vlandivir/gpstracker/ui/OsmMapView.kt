package com.vlandivir.gpstracker.ui

import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.vlandivir.gpstracker.gpx.GeoFix
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.mylocation.GpsMyLocationProvider
import org.osmdroid.views.overlay.mylocation.MyLocationNewOverlay

private val OsmTiles = XYTileSource(
    "Mapnik",
    0,
    19,
    256,
    ".png",
    arrayOf("https://tile.openstreetmap.org/"),
    "© OpenStreetMap contributors",
)

@Composable
fun OsmMapView(
    followUser: Boolean,
    liveLocations: List<GeoFix>,
    selectedLocations: List<GeoFix>,
    selectedTrackId: String?,
    onUserPan: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val mapView = remember {
        MapView(context).apply {
            setTileSource(OsmTiles)
            setMultiTouchControls(true)
            minZoomLevel = 3.0
            maxZoomLevel = 19.0
            isTilesScaledToDpi = true
            controller.setZoom(12.0)
            controller.setCenter(GeoPoint(48.2082, 16.3738))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }
    val liveOverlay = remember { SpeedPathOverlay() }
    val selectedOverlay = remember { SpeedPathOverlay() }
    val myLocation = remember {
        MyLocationNewOverlay(GpsMyLocationProvider(context), mapView).apply {
            enableMyLocation()
        }
    }

    DisposableEffect(mapView) {
        mapView.overlays.add(myLocation)
        mapView.overlays.add(liveOverlay)
        mapView.overlays.add(selectedOverlay)
        val listener = object : MapListener {
            override fun onScroll(event: ScrollEvent?): Boolean {
                if (event != null) onUserPan()
                return false
            }

            override fun onZoom(event: ZoomEvent?): Boolean = false
        }
        mapView.addMapListener(listener)
        mapView.onResume()
        onDispose {
            mapView.removeMapListener(listener)
            myLocation.disableMyLocation()
            myLocation.disableFollowLocation()
            mapView.onPause()
            mapView.onDetach()
        }
    }

    LaunchedEffect(followUser) {
        if (followUser) myLocation.enableFollowLocation() else myLocation.disableFollowLocation()
    }

    LaunchedEffect(liveLocations) {
        liveOverlay.locations = liveLocations
        mapView.invalidate()
    }

    LaunchedEffect(selectedTrackId, selectedLocations) {
        selectedOverlay.locations = selectedLocations
        mapView.invalidate()
    }

    LaunchedEffect(selectedTrackId) {
        if (selectedTrackId != null && selectedLocations.size >= 2) {
            val box = BoundingBox.fromGeoPoints(selectedLocations.map { it.toGeoPoint() })
            mapView.zoomToBoundingBox(box, true, 80)
        }
    }

    AndroidView(factory = { mapView }, modifier = modifier)
}
