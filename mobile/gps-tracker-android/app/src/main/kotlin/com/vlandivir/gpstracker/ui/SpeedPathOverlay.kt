package com.vlandivir.gpstracker.ui

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Point
import com.vlandivir.gpstracker.gpx.GeoFix
import com.vlandivir.gpstracker.gpx.SpeedGradient
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Overlay

class SpeedPathOverlay : Overlay() {
    var locations: List<GeoFix> = emptyList()
        set(value) {
            field = value
            speeds = SpeedGradient.displaySpeedsKmh(value)
        }

    private var speeds: List<Double> = emptyList()
    private val pointA = Point()
    private val pointB = Point()

    private val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = 0x59000000
    }

    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    override fun draw(canvas: Canvas, mapView: MapView, shadow: Boolean) {
        if (shadow || locations.size < 2 || speeds.size != locations.size - 1) return
        val projection = mapView.projection
        val width = 7f * mapView.context.resources.displayMetrics.density
        halo.strokeWidth = width + 3f
        stroke.strokeWidth = width

        projection.toPixels(locations.first().toGeoPoint(), pointA)
        var prevX = pointA.x.toFloat()
        var prevY = pointA.y.toFloat()
        for (i in 1 until locations.size) {
            projection.toPixels(locations[i].toGeoPoint(), pointB)
            val x = pointB.x.toFloat()
            val y = pointB.y.toFloat()
            canvas.drawLine(prevX, prevY, x, y, halo)
            prevX = x
            prevY = y
        }

        projection.toPixels(locations.first().toGeoPoint(), pointA)
        prevX = pointA.x.toFloat()
        prevY = pointA.y.toFloat()
        for (i in speeds.indices) {
            projection.toPixels(locations[i + 1].toGeoPoint(), pointB)
            val x = pointB.x.toFloat()
            val y = pointB.y.toFloat()
            stroke.color = SpeedGradient.color(speeds[i])
            canvas.drawLine(prevX, prevY, x, y, stroke)
            prevX = x
            prevY = y
        }
    }
}

fun GeoFix.toGeoPoint(): GeoPoint = GeoPoint(latitude, longitude)
