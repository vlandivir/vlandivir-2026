package com.vlandivir.gpstracker.gpx

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object GpxWriter {
    const val creator = "vlandivir-gps-tracker"

    private val iso: SimpleDateFormat
        get() = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

    fun tracksDirectory(filesDir: File): File {
        val dir = File(filesDir, "tracks")
        dir.mkdirs()
        return dir
    }

    fun file(filesDir: File, fileName: String): File =
        File(tracksDirectory(filesDir), fileName)

    fun write(filesDir: File, fileName: String, name: String, startedAtMs: Long, segments: List<List<GeoFix>>) {
        file(filesDir, fileName).writeText(buildXml(name, startedAtMs, segments), Charsets.UTF_8)
    }

    fun buildXml(name: String, startedAtMs: Long, segments: List<List<GeoFix>>): String {
        val out = StringBuilder()
        out.append("""<?xml version="1.0" encoding="UTF-8"?>""").append('\n')
        out.append(
            """<gpx version="1.1" creator="$creator" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">""",
        )
        out.append('\n')
        out.append("  <metadata>\n")
        out.append("    <name>${escape(name)}</name>\n")
        out.append("    <time>${iso(startedAtMs)}</time>\n")
        out.append("  </metadata>\n")
        out.append("  <trk>\n")
        out.append("    <name>${escape(name)}</name>\n")
        for (segment in segments) {
            if (segment.isEmpty()) continue
            out.append("    <trkseg>\n")
            for (loc in segment) {
                out.append(
                    """      <trkpt lat="${fmt(loc.latitude)}" lon="${fmt(loc.longitude)}">""",
                )
                out.append('\n')
                if (loc.altitude != null && loc.verticalAccuracy >= 0) {
                    out.append("        <ele>${fmt(loc.altitude)}</ele>\n")
                }
                out.append("        <time>${iso(loc.timestampMs)}</time>\n")
                out.append("      </trkpt>\n")
            }
            out.append("    </trkseg>\n")
        }
        out.append("  </trk>\n")
        out.append("</gpx>\n")
        return out.toString()
    }

    fun parseLocations(file: File): List<GeoFix> {
        if (!file.exists()) return emptyList()
        val xml = file.readText(Charsets.UTF_8)
        val regex = Regex(
            """<trkpt\s+lat="([-0-9.]+)"\s+lon="([-0-9.]+)"\s*>\s*(?:<ele>([-0-9.]+)</ele>\s*)?(?:<time>([^<]+)</time>\s*)?""",
            setOf(RegexOption.DOT_MATCHES_ALL),
        )
        return regex.findAll(xml).mapNotNull { match ->
            val lat = match.groupValues[1].toDoubleOrNull() ?: return@mapNotNull null
            val lon = match.groupValues[2].toDoubleOrNull() ?: return@mapNotNull null
            val ele = match.groupValues[3].toDoubleOrNull()
            val time = match.groupValues.getOrNull(4).orEmpty()
            val timestamp = parseIso(time) ?: System.currentTimeMillis()
            GeoFix(
                latitude = lat,
                longitude = lon,
                altitude = ele,
                horizontalAccuracy = 10.0,
                verticalAccuracy = if (ele != null) 10.0 else -1.0,
                timestampMs = timestamp,
            )
        }.toList()
    }

    private fun iso(ms: Long): String = iso.format(Date(ms))

    private fun parseIso(value: String): Long? {
        if (value.isBlank()) return null
        return runCatching { iso.parse(value)?.time }.getOrNull()
            ?: runCatching {
                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.parse(value)?.time
            }.getOrNull()
    }

    private fun fmt(value: Double): String = String.format(Locale.US, "%.7f", value)

    private fun escape(text: String): String =
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&apos;")
}
