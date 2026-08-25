package com.vlandivir.gpstracker.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vlandivir.gpstracker.data.TrackEntity
import com.vlandivir.gpstracker.gpx.GeoFix
import com.vlandivir.gpstracker.location.LocationRecorder

@Composable
fun MapHomeScreen(recorder: LocationRecorder) {
    val state by recorder.state.collectAsStateWithLifecycle()
    val live by recorder.liveLocations.collectAsStateWithLifecycle()
    val distance by recorder.distanceM.collectAsStateWithLifecycle()
    val points by recorder.pointCount.collectAsStateWithLifecycle()
    val error by recorder.lastError.collectAsStateWithLifecycle()
    val tracks by recorder.tracks.collectAsStateWithLifecycle()

    var showTracks by remember { mutableStateOf(false) }
    var followUser by remember { mutableStateOf(false) }
    var selectedTrack by remember { mutableStateOf<TrackEntity?>(null) }
    var selectedLocations by remember { mutableStateOf<List<GeoFix>>(emptyList()) }
    var selectedVariant by remember { mutableStateOf(LocationRecorder.ShareVariant.Original) }
    var permissionTick by remember { mutableIntStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) permissionTick++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            recorder.start()
        }
    }

    fun requestAndStart() {
        selectedTrack = null
        selectedLocations = emptyList()
        selectedVariant = LocationRecorder.ShareVariant.Original
        val needed = buildList {
            if (!recorder.hasFineLocation) add(Manifest.permission.ACCESS_FINE_LOCATION)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        } else {
            recorder.start()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        OsmMapView(
            followUser = followUser && selectedTrack == null,
            liveLocations = live,
            selectedLocations = selectedLocations,
            selectedTrackId = selectedTrack?.id,
            onUserPan = { followUser = false },
            modifier = Modifier.fillMaxSize(),
        )

        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 48.dp, start = 16.dp, end = 16.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChipButton(onClick = { showTracks = true }) {
                Icon(Icons.AutoMirrored.Filled.List, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Tracks")
            }
            IconButton(
                onClick = {
                    followUser = true
                    selectedTrack = null
                    selectedLocations = emptyList()
                    selectedVariant = LocationRecorder.ShareVariant.Original
                },
                colors = IconButtonDefaults.iconButtonColors(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                ),
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)),
            ) {
                Icon(Icons.Filled.LocationOn, contentDescription = "Follow my location")
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (selectedTrack != null || state != LocationRecorder.State.Idle) {
                SpeedLegend()
            }
            if (selectedTrack != null) {
                Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 4.dp) {
                    SingleChoiceSegmentedButtonRow(modifier = Modifier.padding(4.dp)) {
                        SegmentedButton(
                            selected = selectedVariant == LocationRecorder.ShareVariant.Original,
                            onClick = {
                                selectedVariant = LocationRecorder.ShareVariant.Original
                                selectedTrack?.let {
                                    selectedLocations = recorder.locations(it, selectedVariant)
                                }
                            },
                            shape = SegmentedButtonDefaults.itemShape(0, 2),
                        ) { Text("Original") }
                        SegmentedButton(
                            selected = selectedVariant == LocationRecorder.ShareVariant.Smoothed,
                            onClick = {
                                selectedVariant = LocationRecorder.ShareVariant.Smoothed
                                selectedTrack?.let {
                                    selectedLocations = recorder.locations(it, selectedVariant)
                                }
                            },
                            shape = SegmentedButtonDefaults.itemShape(1, 2),
                        ) { Text("Smoothed") }
                    }
                }
            }
            error?.let { message ->
                Text(
                    message,
                    color = Color.White,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.Red.copy(alpha = 0.85f))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            LocationModeChip(recorder = recorder, permissionTick = permissionTick)
            if (state != LocationRecorder.State.Idle) {
                Surface(shape = RoundedCornerShape(50), tonalElevation = 4.dp) {
                    val bg = if (recorder.hasBackgroundLocation) "BG" else "FG"
                    Text(
                        "${formatDistance(distance)} · $points pts · $bg",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
            ControlBar(
                state = state,
                onList = { showTracks = true },
                onStart = { requestAndStart() },
                onPause = { recorder.pause() },
                onResume = { recorder.resume() },
                onStop = { recorder.stop() },
            )
        }
    }

    if (showTracks) {
        TrackListSheet(
            tracks = tracks,
            recorder = recorder,
            onDismiss = { showTracks = false },
            onShowOnMap = { track ->
                selectedTrack = track
                selectedVariant = LocationRecorder.ShareVariant.Original
                selectedLocations = recorder.locations(track, LocationRecorder.ShareVariant.Original)
                followUser = false
                showTracks = false
            },
        )
    }
}

@Composable
private fun LocationModeChip(recorder: LocationRecorder, permissionTick: Int) {
    val context = LocalContext.current
    val backgroundOn = permissionTick >= 0 && recorder.hasBackgroundLocation
    val bgLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    ChipButton(
        onClick = {
            if (!backgroundOn) {
                if (recorder.hasFineLocation) {
                    bgLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                }
                val intent = Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", context.packageName, null),
                )
                context.startActivity(intent)
            }
        },
    ) {
        Text(
            if (backgroundOn) {
                "Background On · ${recorder.authorizationLabel}"
            } else {
                "Background Off · ${recorder.authorizationLabel}"
            },
            color = if (backgroundOn) MaterialTheme.colorScheme.onSurface else Color(0xFFEA580C),
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun ControlBar(
    state: LocationRecorder.State,
    onList: () -> Unit,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        tonalElevation = 6.dp,
        modifier = Modifier.padding(horizontal = 16.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onList) {
                Icon(Icons.AutoMirrored.Filled.List, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("List")
            }
            when (state) {
                LocationRecorder.State.Idle -> {
                    FilledTonalButton(
                        onClick = onStart,
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Color(0xFFDC2626),
                            contentColor = Color.White,
                        ),
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Start")
                    }
                }
                LocationRecorder.State.Recording -> {
                    FilledTonalButton(onClick = onPause) {
                        Icon(Icons.Filled.Pause, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Pause")
                    }
                    FilledTonalButton(
                        onClick = onStop,
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Color(0xFFDC2626),
                            contentColor = Color.White,
                        ),
                    ) {
                        Icon(Icons.Filled.Stop, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Stop")
                    }
                }
                LocationRecorder.State.Paused -> {
                    FilledTonalButton(onClick = onResume) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Resume")
                    }
                    FilledTonalButton(
                        onClick = onStop,
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Color(0xFFDC2626),
                            contentColor = Color.White,
                        ),
                    ) {
                        Icon(Icons.Filled.Stop, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Stop")
                    }
                }
            }
        }
    }
}

@Composable
private fun SpeedLegend() {
    Surface(shape = RoundedCornerShape(50), tonalElevation = 4.dp) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("0", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box(
                Modifier
                    .width(140.dp)
                    .size(height = 8.dp, width = 140.dp)
                    .clip(RoundedCornerShape(50))
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                Color(0xFF16A34A),
                                Color(0xFF22C55E),
                                Color(0xFFA2D622),
                                Color(0xFFEAB308),
                                Color(0xFFF97316),
                                Color(0xFFEF4444),
                                Color(0xFFA855F7),
                                Color.Black,
                            ),
                        ),
                    ),
            )
            Text("5·15·25…200", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ChipButton(onClick: () -> Unit, content: @Composable () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(50), tonalElevation = 4.dp) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) { content() }
    }
}

fun formatDistance(meters: Double): String =
    if (meters >= 1000) String.format("%.2f km", meters / 1000)
    else String.format("%.0f m", meters)

fun formatDuration(ms: Long): String {
    val total = (ms / 1000).toInt()
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, s) else String.format("%d:%02d", m, s)
}
