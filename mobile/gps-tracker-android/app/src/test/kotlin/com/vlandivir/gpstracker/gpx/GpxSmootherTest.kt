package com.vlandivir.gpstracker.gpx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GpxSmootherTest {
    @Test
    fun dropsOutAndBackSpike() {
        val base = 1_700_000_000_000L
        val points = listOf(
            GeoFix(48.0, 16.0, timestampMs = base),
            GeoFix(48.0002, 16.0, timestampMs = base + 2_000),
            GeoFix(48.0002, 16.0005, timestampMs = base + 4_000),
            GeoFix(48.0004, 16.0, timestampMs = base + 6_000),
        )
        val smoothed = GpxSmoother.smoothSegment(points)
        assertTrue(smoothed.size < points.size || smoothed[2].longitude < points[2].longitude)
    }

    @Test
    fun writesAndParsesRoundTrip() {
        val started = 1_700_000_000_000L
        val points = listOf(
            GeoFix(48.2, 16.3, altitude = 180.0, verticalAccuracy = 10.0, timestampMs = started),
            GeoFix(48.21, 16.31, altitude = 181.0, verticalAccuracy = 10.0, timestampMs = started + 5_000),
        )
        val xml = GpxWriter.buildXml("Track test", started, listOf(points))
        val tmp = kotlin.io.path.createTempFile(suffix = ".gpx").toFile()
        tmp.writeText(xml)
        val parsed = GpxWriter.parseLocations(tmp)
        tmp.delete()
        assertEquals(2, parsed.size)
        assertEquals(48.2, parsed[0].latitude, 1e-6)
        assertEquals(16.3, parsed[0].longitude, 1e-6)
    }

    @Test
    fun speedColorStretchesLowRange() {
        val walk = SpeedGradient.color(4.0)
        val bike = SpeedGradient.color(20.0)
        val car = SpeedGradient.color(80.0)
        assertTrue(walk != bike)
        assertTrue(bike != car)
    }
}
