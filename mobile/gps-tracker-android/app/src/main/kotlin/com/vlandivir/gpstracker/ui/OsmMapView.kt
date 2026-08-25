package com.vlandivir.gpstracker.ui

import android.view.MotionEvent
import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.vlandivir.gpstracker.gpx.GeoFix
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
    previewLocation: GeoFix?,
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
            controller.setZoom(5.0)
            controller.setCenter(GeoPoint(44.8, 20.5))
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
        mapView.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_MOVE && event.pointerCount >= 1) {
                onUserPan()
            }
            false
        }
        mapView.onResume()
        onDispose {
            mapView.setOnTouchListener(null)
            myLocation.disableMyLocation()
            myLocation.disableFollowLocation()
            mapView.onPause()
            mapView.onDetach()
        }
    }

    LaunchedEffect(followUser, previewLocation) {
        if (!followUser) {
            myLocation.disableFollowLocation()
            return@LaunchedEffect
        }
        myLocation.enableFollowLocation()
        val overlayPoint = myLocation.myLocation
        val target = previewLocation?.toGeoPoint()
            ?: overlayPoint?.let { GeoPoint(it.latitude, it.longitude) }
        if (target != null) {
            mapView.controller.animateTo(target, 16.0, 400L)
        }
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
