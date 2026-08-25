package com.vlandivir.gpstracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.vlandivir.gpstracker.ui.MapHomeScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val recorder = (application as GpsTrackerApp).recorder
        setContent {
            GpsTrackerTheme {
                MapHomeScreen(recorder = recorder)
            }
        }
    }
}

private val Green = Color(0xFF16A34A)

@Composable
private fun GpsTrackerTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) {
            darkColorScheme(primary = Green)
        } else {
            lightColorScheme(primary = Green)
        },
        content = content,
    )
}
