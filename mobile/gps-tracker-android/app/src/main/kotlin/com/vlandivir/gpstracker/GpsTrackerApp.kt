package com.vlandivir.gpstracker

import android.app.Application
import androidx.room.Room
import com.vlandivir.gpstracker.data.AppDatabase
import com.vlandivir.gpstracker.location.LocationRecorder
import org.osmdroid.config.Configuration
import java.io.File

class GpsTrackerApp : Application() {
    lateinit var database: AppDatabase
        private set
    lateinit var recorder: LocationRecorder
        private set

    override fun onCreate() {
        super.onCreate()
        val osm = Configuration.getInstance()
        osm.load(this, getSharedPreferences("osmdroid", MODE_PRIVATE))
        osm.userAgentValue = OSM_USER_AGENT
        osm.osmdroidBasePath = File(cacheDir, "osmdroid")
        osm.osmdroidTileCache = File(cacheDir, "osm-tiles")

        database = Room.databaseBuilder(this, AppDatabase::class.java, "gps-tracker.db").build()
        recorder = LocationRecorder(this, database.trackDao())
        recorder.recoverInterruptedTrack()
    }
}
