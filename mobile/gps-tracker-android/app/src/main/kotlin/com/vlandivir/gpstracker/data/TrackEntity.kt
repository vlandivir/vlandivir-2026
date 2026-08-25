package com.vlandivir.gpstracker.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tracks")
data class TrackEntity(
    @PrimaryKey val id: String,
    val name: String,
    val startedAt: Long,
    val endedAt: Long?,
    /** recording | paused | finished */
    val status: String,
    val gpxFileName: String,
    val distanceM: Double,
    val pointCount: Int,
) {
    val isActive: Boolean get() = status == "recording" || status == "paused"

    val durationMs: Long get() = (endedAt ?: System.currentTimeMillis()) - startedAt
}
