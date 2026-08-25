package com.vlandivir.gpstracker.gpx

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class GeoFix(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double? = null,
    val horizontalAccuracy: Double = 10.0,
    val verticalAccuracy: Double = -1.0,
    val timestampMs: Long,
    val speedMps: Double? = null,
)

fun GeoFix.distanceTo(other: GeoFix): Double {
    val earthM = 6_371_000.0
    val lat1 = Math.toRadians(latitude)
    val lat2 = Math.toRadians(other.latitude)
    val dLat = Math.toRadians(other.latitude - latitude)
    val dLon = Math.toRadians(other.longitude - longitude)
    val a = sin(dLat / 2) * sin(dLat / 2) +
        cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
    return 2 * earthM * atan2(sqrt(a), sqrt(1 - a))
}
