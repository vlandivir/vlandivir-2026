package com.vlandivir.gpstracker.location

import android.Manifest
import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.vlandivir.gpstracker.data.TrackDao
import com.vlandivir.gpstracker.data.TrackEntity
import com.vlandivir.gpstracker.gpx.GeoFix
import com.vlandivir.gpstracker.gpx.GpxSmoother
import com.vlandivir.gpstracker.gpx.GpxWriter
import com.vlandivir.gpstracker.gpx.distanceTo
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LocationRecorder(
    private val app: Application,
    private val dao: TrackDao,
) {
    enum class State { Idle, Recording, Paused }
    enum class ShareVariant { Original, Smoothed }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val fused = LocationServices.getFusedLocationProviderClient(app)

    private val _state = MutableStateFlow(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    private val _activeTrack = MutableStateFlow<TrackEntity?>(null)
    val activeTrack: StateFlow<TrackEntity?> = _activeTrack.asStateFlow()

    private val _liveLocations = MutableStateFlow<List<GeoFix>>(emptyList())
    val liveLocations: StateFlow<List<GeoFix>> = _liveLocations.asStateFlow()

    private val _distanceM = MutableStateFlow(0.0)
    val distanceM: StateFlow<Double> = _distanceM.asStateFlow()

    private val _pointCount = MutableStateFlow(0)
    val pointCount: StateFlow<Int> = _pointCount.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    val tracks: StateFlow<List<TrackEntity>> = dao.observeAll()
        .stateIn(scope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private var segments: MutableList<List<GeoFix>> = mutableListOf()
    private var currentSegment: MutableList<GeoFix> = mutableListOf()
    private var lastFix: GeoFix? = null
    private var pointsSinceFlush = 0

    private val _previewLocation = MutableStateFlow<GeoFix?>(null)
    val previewLocation: StateFlow<GeoFix?> = _previewLocation.asStateFlow()

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            for (location in result.locations) {
                val fix = location.toFix()
                _previewLocation.value = fix
                append(fix)
            }
        }
    }

    private val managerListener = LocationListener { location ->
        val fix = location.toFix()
        _previewLocation.value = fix
        append(fix)
    }

    val hasFineLocation: Boolean
        get() = ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    val hasNotifications: Boolean
        get() = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    val hasBackgroundLocation: Boolean
        get() = ContextCompat.checkSelfPermission(
            app,
            Manifest.permission.ACCESS_BACKGROUND_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED

    val authorizationLabel: String
        get() = when {
            hasBackgroundLocation -> "Always"
            hasFineLocation -> "While Using"
            else -> "Not set"
        }

    fun recoverInterruptedTrack() {
        scope.launch {
            val open = withContext(Dispatchers.IO) { dao.openTracks() }
            if (open.isEmpty()) return@launch
            val now = System.currentTimeMillis()
            for (track in open) {
                withContext(Dispatchers.IO) {
                    dao.update(
                        track.copy(
                            status = "finished",
                            endedAt = track.endedAt ?: now,
                        ),
                    )
                }
            }
            resetLive()
        }
    }

    fun start() {
        _lastError.value = null
        if (_state.value != State.Idle) return
        if (!hasFineLocation) {
            _lastError.value = "Allow location access, then tap Start again."
            return
        }

        val startedAt = System.currentTimeMillis()
        val id = UUID.randomUUID().toString()
        val track = TrackEntity(
            id = id,
            name = defaultName(startedAt),
            startedAt = startedAt,
            endedAt = null,
            status = "recording",
            gpxFileName = "$id.gpx",
            distanceM = 0.0,
            pointCount = 0,
        )
        scope.launch {
            withContext(Dispatchers.IO) { dao.upsert(track) }
        }

        segments = mutableListOf()
        currentSegment = mutableListOf()
        lastFix = null
        _liveLocations.value = emptyList()
        _distanceM.value = 0.0
        _pointCount.value = 0
        pointsSinceFlush = 0
        _activeTrack.value = track
        _state.value = State.Recording
        try {
            beginLocationUpdates()
            startRecordingService()
        } catch (error: Exception) {
            _lastError.value = error.message ?: "Could not start recording"
            endLocationUpdates()
            stopRecordingService()
            resetLive()
            return
        }
        flushGpx()
    }

    fun pause() {
        val track = _activeTrack.value ?: return
        if (_state.value != State.Recording) return
        if (currentSegment.isNotEmpty()) {
            segments.add(currentSegment.toList())
            currentSegment = mutableListOf()
        }
        lastFix = null
        val updated = track.copy(status = "paused")
        _activeTrack.value = updated
        persist(updated)
        _state.value = State.Paused
        endLocationUpdates()
        stopRecordingService()
        flushGpx()
    }

    fun resume() {
        val track = _activeTrack.value ?: return
        if (_state.value != State.Paused) return
        lastFix = null
        val updated = track.copy(status = "recording")
        _activeTrack.value = updated
        persist(updated)
        _state.value = State.Recording
        beginLocationUpdates()
        startRecordingService()
    }

    fun stop() {
        val track = _activeTrack.value ?: return
        if (_state.value != State.Recording && _state.value != State.Paused) return
        if (currentSegment.isNotEmpty()) {
            segments.add(currentSegment.toList())
            currentSegment = mutableListOf()
        }
        endLocationUpdates()
        stopRecordingService()
        val updated = track.copy(
            status = "finished",
            endedAt = System.currentTimeMillis(),
            distanceM = _distanceM.value,
            pointCount = _pointCount.value,
        )
        persist(updated)
        flushGpx()
        resetLive()
    }

    fun delete(track: TrackEntity) {
        if (_activeTrack.value?.id == track.id) {
            stop()
        }
        GpxWriter.file(app.filesDir, track.gpxFileName).delete()
        scope.launch { withContext(Dispatchers.IO) { dao.delete(track) } }
    }

    fun shareFile(track: TrackEntity, variant: ShareVariant): File? {
        val source = GpxWriter.file(app.filesDir, track.gpxFileName)
        if (!source.exists()) return null
        val destDir = File(app.cacheDir, "shared").apply { mkdirs() }
        val dest = File(destDir, shareFileName(track, variant))
        dest.delete()
        return try {
            when (variant) {
                ShareVariant.Original -> source.copyTo(dest)
                ShareVariant.Smoothed -> {
                    val raw = GpxWriter.parseLocations(source)
                    val smoothed = GpxSmoother.smooth(listOf(raw))
                    dest.writeText(
                        GpxWriter.buildXml(
                            name = "${track.name} (smoothed)",
                            startedAtMs = track.startedAt,
                            segments = smoothed,
                        ),
                        Charsets.UTF_8,
                    )
                    dest
                }
            }
        } catch (_: Exception) {
            _lastError.value = "Could not prepare share file."
            null
        }
    }

    fun shareUri(track: TrackEntity, variant: ShareVariant) =
        shareFile(track, variant)?.let {
            FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", it)
        }

    fun locations(track: TrackEntity, variant: ShareVariant): List<GeoFix> {
        if (_activeTrack.value?.id == track.id) return _liveLocations.value
        val raw = GpxWriter.parseLocations(GpxWriter.file(app.filesDir, track.gpxFileName))
        return when (variant) {
            ShareVariant.Original -> raw
            ShareVariant.Smoothed -> GpxSmoother.smooth(listOf(raw)).flatten()
        }
    }

    fun showPermissionError() {
        _lastError.value = "Allow location access, then tap Start again."
    }

    fun fetchLastLocation() {
        if (!hasFineLocation) return
        fused.lastLocation
            .addOnSuccessListener { location ->
                if (location != null) _previewLocation.value = location.toFix()
            }
            .addOnFailureListener { error ->
                _lastError.value = error.message
            }
    }

    private fun beginLocationUpdates() {
        if (!hasFineLocation) return
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
            .setMinUpdateIntervalMillis(0)
            .setMinUpdateDistanceMeters(0f)
            .setWaitForAccurateLocation(false)
            .build()
        fused.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
            .addOnFailureListener { error ->
                _lastError.value = "Fused location failed, using GPS: ${error.message}"
                startLocationManagerFallback()
            }
        fused.lastLocation.addOnSuccessListener { location ->
            if (location != null) _previewLocation.value = location.toFix()
        }
    }

    private fun startLocationManagerFallback() {
        val manager = app.getSystemService(LocationManager::class.java) ?: return
        try {
            if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                manager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    1000L,
                    0f,
                    managerListener,
                    Looper.getMainLooper(),
                )
            }
            if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                manager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    2000L,
                    0f,
                    managerListener,
                    Looper.getMainLooper(),
                )
            }
            manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let {
                _previewLocation.value = it.toFix()
            }
        } catch (error: SecurityException) {
            _lastError.value = error.message
        }
    }

    private fun endLocationUpdates() {
        fused.removeLocationUpdates(locationCallback)
        app.getSystemService(LocationManager::class.java)?.removeUpdates(managerListener)
    }

    private fun startRecordingService() {
        ContextCompat.startForegroundService(app, Intent(app, RecordingService::class.java))
    }

    private fun stopRecordingService() {
        app.stopService(Intent(app, RecordingService::class.java))
    }

    private fun append(location: GeoFix) {
        if (_state.value != State.Recording) return
        if (location.horizontalAccuracy < 0 || location.horizontalAccuracy > 100) return

        lastFix?.let { prev ->
            _distanceM.value += prev.distanceTo(location)
        }
        currentSegment.add(location)
        lastFix = location
        _liveLocations.value = _liveLocations.value + location
        _pointCount.value += 1
        pointsSinceFlush += 1

        _activeTrack.value = _activeTrack.value?.copy(
            distanceM = _distanceM.value,
            pointCount = _pointCount.value,
        )

        if (pointsSinceFlush >= 10) {
            pointsSinceFlush = 0
            _activeTrack.value?.let { persist(it) }
            flushGpx()
        }
    }

    private fun flushGpx() {
        val track = _activeTrack.value ?: return
        val all = segments.toMutableList()
        if (currentSegment.isNotEmpty()) all.add(currentSegment.toList())
        try {
            GpxWriter.write(
                filesDir = app.filesDir,
                fileName = track.gpxFileName,
                name = track.name,
                startedAtMs = track.startedAt,
                segments = all,
            )
        } catch (error: Exception) {
            _lastError.value = "Failed to write GPX: ${error.message}"
        }
    }

    private fun persist(track: TrackEntity) {
        scope.launch { withContext(Dispatchers.IO) { dao.upsert(track) } }
    }

    private fun resetLive() {
        _activeTrack.value = null
        _state.value = State.Idle
        _liveLocations.value = emptyList()
        _distanceM.value = 0.0
        _pointCount.value = 0
        segments = mutableListOf()
        currentSegment = mutableListOf()
        lastFix = null
    }

    companion object {
        fun defaultName(startedAtMs: Long): String {
            val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.UK)
            return "Track ${fmt.format(Date(startedAtMs))}"
        }

        fun shareFileName(track: TrackEntity, variant: ShareVariant): String {
            val fmt = SimpleDateFormat("yyyy-MM-dd_HH-mm", Locale.UK)
            val stamp = fmt.format(Date(track.startedAt))
            return when (variant) {
                ShareVariant.Original -> "Track_$stamp.gpx"
                ShareVariant.Smoothed -> "Track_${stamp}_smoothed.gpx"
            }
        }
    }
}

private fun Location.toFix(): GeoFix = GeoFix(
    latitude = latitude,
    longitude = longitude,
    altitude = if (hasAltitude()) altitude else null,
    horizontalAccuracy = if (hasAccuracy()) accuracy.toDouble() else 10.0,
    verticalAccuracy = if (hasVerticalAccuracy()) verticalAccuracyMeters.toDouble() else -1.0,
    timestampMs = time,
    speedMps = if (hasSpeed()) speed.toDouble() else null,
)
