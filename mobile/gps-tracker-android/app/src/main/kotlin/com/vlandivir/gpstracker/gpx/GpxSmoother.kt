package com.vlandivir.gpstracker.gpx

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/** Post-process only — never applied while recording. Port of iOS GpxSmoother. */
object GpxSmoother {
    const val minSpikeLengthM = 25.0
    const val maxReturnFraction = 0.55
    const val maxSpikePasses = 5
    const val crossTrackGain = 0.22
    const val headingAlpha = 0.35
    const val minAlongForHeadingM = 4.0
    const val dwellMinDurationS = 45.0
    const val dwellMinPathM = 40.0
    const val dwellMaxNetM = 18.0
    const val dwellMinPathOverNet = 4.0
    const val dwellMaxAvgSpeedMps = 1.5
    const val dwellLookaheadS = 240.0

    fun smooth(segments: List<List<GeoFix>>): List<List<GeoFix>> =
        segments.map { smoothSegment(it) }.filter { it.isNotEmpty() }

    fun smoothSegment(raw: List<GeoFix>): List<GeoFix> {
        if (raw.size < 2) return raw
        var points = collapseStationaryWander(raw)
        for (pass in 0 until maxSpikePasses) {
            val cleaned = removeOutAndBackSpikes(points)
            if (cleaned.size == points.size) break
            points = cleaned
            if (points.size < 3) break
        }
        return dampenCrossTrack(points)
    }

    private fun collapseStationaryWander(points: List<GeoFix>): List<GeoFix> {
        if (points.size < 4) return points
        val out = mutableListOf<GeoFix>()
        var i = 0
        while (i < points.size) {
            val end = dwellEndIndex(points, i)
            if (end != null) {
                out.add(points[i])
                i = end
            } else {
                out.add(points[i])
                i += 1
            }
        }
        return out
    }

    private fun dwellEndIndex(points: List<GeoFix>, start: Int): Int? {
        var best: Int? = null
        var path = 0.0
        var j = start + 1
        while (j < points.size) {
            val dt = (points[j].timestampMs - points[start].timestampMs) / 1000.0
            if (dt > dwellLookaheadS) break
            path += points[j - 1].distanceTo(points[j])
            val net = points[start].distanceTo(points[j])
            val avgSpeed = path / max(dt, 0.1)
            if (
                dt >= dwellMinDurationS &&
                path >= dwellMinPathM &&
                net <= dwellMaxNetM &&
                path >= net * dwellMinPathOverNet &&
                avgSpeed <= dwellMaxAvgSpeedMps
            ) {
                best = j
            }
            j += 1
        }
        return best
    }

    private fun removeOutAndBackSpikes(points: List<GeoFix>): List<GeoFix> {
        if (points.size < 3) return points
        val keep = BooleanArray(points.size) { true }
        for (i in 1 until points.lastIndex) {
            val a = points[i - 1]
            val b = points[i]
            val c = points[i + 1]
            val ab = a.distanceTo(b)
            val bc = b.distanceTo(c)
            val ac = a.distanceTo(c)
            val cte = crossTrackMeters(b, a, c)
            val farOut = max(ab, bc) >= minSpikeLengthM && cte >= minSpikeLengthM * 0.6
            val cameBack = ac <= ab * maxReturnFraction && ac <= bc * maxReturnFraction
            if (farOut && cameBack) keep[i] = false
        }
        return points.filterIndexed { index, _ -> keep[index] }
    }

    private fun dampenCrossTrack(points: List<GeoFix>): List<GeoFix> {
        if (points.size < 2) return points
        var heading = bearingRadians(points[0], points[1])
        var position = points[0]
        val out = mutableListOf(points[0])
        for (point in points.drop(1)) {
            val delta = localMeters(point, position)
            val along = delta.second * cos(heading) + delta.first * sin(heading)
            val cross = delta.first * cos(heading) - delta.second * sin(heading)
            val crossKept = cross * crossTrackGain
            val east = along * sin(heading) + crossKept * cos(heading)
            val north = along * cos(heading) - crossKept * sin(heading)
            position = location(
                origin = position,
                eastMeters = east,
                northMeters = north,
                altitude = point.altitude,
                horizontalAccuracy = point.horizontalAccuracy,
                verticalAccuracy = point.verticalAccuracy,
                timestampMs = point.timestampMs,
                speedMps = point.speedMps,
            )
            out.add(position)
            if (along >= minAlongForHeadingM) {
                val sample = atan2(delta.first, delta.second)
                heading = lerpAngle(heading, sample, headingAlpha)
            }
        }
        return out
    }

    private fun crossTrackMeters(point: GeoFix, lineStart: GeoFix, lineEnd: GeoFix): Double {
        val b = localMeters(point, lineStart)
        val c = localMeters(lineEnd, lineStart)
        val len2 = c.first * c.first + c.second * c.second
        if (len2 < 1e-6) return point.distanceTo(lineStart)
        return abs(c.first * b.second - c.second * b.first) / sqrt(len2)
    }

    /** Local ENU-ish meters: first = east, second = north. */
    private fun localMeters(location: GeoFix, origin: GeoFix): Pair<Double, Double> {
        val lat0 = origin.latitude * Math.PI / 180
        val mPerDegLat = 111_320.0
        val mPerDegLon = 111_320.0 * cos(lat0)
        val x = (location.longitude - origin.longitude) * mPerDegLon
        val y = (location.latitude - origin.latitude) * mPerDegLat
        return x to y
    }

    private fun location(
        origin: GeoFix,
        eastMeters: Double,
        northMeters: Double,
        altitude: Double?,
        horizontalAccuracy: Double,
        verticalAccuracy: Double,
        timestampMs: Long,
        speedMps: Double?,
    ): GeoFix {
        val lat0 = origin.latitude * Math.PI / 180
        val mPerDegLat = 111_320.0
        val mPerDegLon = max(111_320.0 * cos(lat0), 1e-6)
        return GeoFix(
            latitude = origin.latitude + northMeters / mPerDegLat,
            longitude = origin.longitude + eastMeters / mPerDegLon,
            altitude = altitude,
            horizontalAccuracy = horizontalAccuracy,
            verticalAccuracy = verticalAccuracy,
            timestampMs = timestampMs,
            speedMps = speedMps,
        )
    }

    private fun bearingRadians(from: GeoFix, to: GeoFix): Double {
        val d = localMeters(to, from)
        return atan2(d.first, d.second)
    }

    private fun lerpAngle(a: Double, b: Double, t: Double): Double {
        var delta = b - a
        while (delta > Math.PI) delta -= 2 * Math.PI
        while (delta < -Math.PI) delta += 2 * Math.PI
        return a + delta * t
    }
}
