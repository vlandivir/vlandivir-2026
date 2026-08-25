package com.vlandivir.gpstracker.gpx

import kotlin.math.max
import kotlin.math.min

/** Speed → color stops shared with `/gpx-track-demo` and the iOS app. Packed ARGB. */
object SpeedGradient {
    data class Stop(val kmh: Double, val color: Int)

    val stops: List<Stop> = listOf(
        Stop(0.0, rgb(0x16, 0xa3, 0x4a)),
        Stop(5.0, rgb(0x22, 0xc5, 0x5e)),
        Stop(15.0, rgb(0xa2, 0xd6, 0x22)),
        Stop(25.0, rgb(0xea, 0xb3, 0x08)),
        Stop(50.0, rgb(0xf9, 0x73, 0x16)),
        Stop(90.0, rgb(0xef, 0x44, 0x44)),
        Stop(140.0, rgb(0xa8, 0x55, 0xf7)),
        Stop(200.0, rgb(0x00, 0x00, 0x00)),
    )

    const val minSegmentDurationS = 0.35
    const val medianRadius = 2
    const val maxAccelerationMps2 = 3.5

    fun color(kmh: Double): Int {
        val v = max(0.0, kmh)
        if (v <= stops.first().kmh) return stops.first().color
        for (i in 1 until stops.size) {
            val a = stops[i - 1]
            val b = stops[i]
            if (v <= b.kmh) {
                val t = (v - a.kmh) / (b.kmh - a.kmh)
                return lerp(a.color, b.color, t)
            }
        }
        return stops.last().color
    }

    fun segmentSpeedKmh(from: GeoFix, to: GeoFix): Double {
        val dt = (to.timestampMs - from.timestampMs) / 1000.0
        if (dt < minSegmentDurationS) return 0.0
        return (to.distanceTo(from) / dt) * 3.6
    }

    fun displaySpeedsKmh(locations: List<GeoFix>): List<Double> {
        val raw = speedsKmh(locations)
        if (raw.isEmpty()) return emptyList()
        return clampAcceleration(rollingMedian(raw, medianRadius), locations)
    }

    fun speedsKmh(locations: List<GeoFix>): List<Double> {
        if (locations.size < 2) return emptyList()
        return (1 until locations.size).map { i ->
            val device = locations[i].speedMps
            if (device != null && device >= 0) device * 3.6
            else segmentSpeedKmh(locations[i - 1], locations[i])
        }
    }

    private fun rollingMedian(values: List<Double>, radius: Int): List<Double> {
        if (radius <= 0 || values.size <= 1) return values
        return values.indices.map { i ->
            val lo = max(0, i - radius)
            val hi = min(values.lastIndex, i + radius)
            val window = values.subList(lo, hi + 1).sorted()
            window[window.size / 2]
        }
    }

    private fun clampAcceleration(speedsKmh: List<Double>, locations: List<GeoFix>): List<Double> {
        if (speedsKmh.size < 2) return speedsKmh
        val out = speedsKmh.toMutableList()
        for (i in 1 until out.size) {
            val dt = (locations[i + 1].timestampMs - locations[i].timestampMs) / 1000.0
            if (dt < minSegmentDurationS) {
                out[i] = out[i - 1]
                continue
            }
            val prev = out[i - 1] / 3.6
            val curr = out[i] / 3.6
            val maxDelta = maxAccelerationMps2 * dt
            val clamped = min(max(curr, prev - maxDelta), prev + maxDelta)
            out[i] = max(0.0, clamped * 3.6)
        }
        return out
    }

    fun rgb(r: Int, g: Int, b: Int): Int =
        (0xFF shl 24) or (r shl 16) or (g shl 8) or b

    private fun lerp(a: Int, b: Int, t: Double): Int {
        val u = t.coerceIn(0.0, 1.0)
        fun chan(shift: Int): Int {
            val av = (a shr shift) and 0xFF
            val bv = (b shr shift) and 0xFF
            return (av + (bv - av) * u).toInt()
        }
        return (chan(24) shl 24) or (chan(16) shl 16) or (chan(8) shl 8) or chan(0)
    }
}
