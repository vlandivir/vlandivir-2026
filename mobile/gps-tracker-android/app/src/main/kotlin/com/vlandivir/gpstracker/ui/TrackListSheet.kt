package com.vlandivir.gpstracker.ui

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.vlandivir.gpstracker.data.TrackEntity
import com.vlandivir.gpstracker.location.LocationRecorder

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackListSheet(
    tracks: List<TrackEntity>,
    recorder: LocationRecorder,
    onDismiss: () -> Unit,
    onShowOnMap: (TrackEntity) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var pendingDelete by remember { mutableStateOf<TrackEntity?>(null) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Text(
            "Tracks",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        if (tracks.isEmpty()) {
            Text(
                "No tracks yet. Start recording to create a GPX track.",
                modifier = Modifier.padding(20.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn {
                items(tracks, key = { it.id }) { track ->
                    TrackRow(
                        track = track,
                        recorder = recorder,
                        onShowOnMap = { onShowOnMap(track) },
                        onDelete = { pendingDelete = track },
                    )
                }
            }
        }
    }

    pendingDelete?.let { track ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete track?") },
            text = { Text("“${track.name}” and its GPX file will be removed. This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    recorder.delete(track)
                    pendingDelete = null
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun TrackRow(
    track: TrackEntity,
    recorder: LocationRecorder,
    onShowOnMap: () -> Unit,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(track.name, style = MaterialTheme.typography.titleMedium)
                if (track.isActive) {
                    Text(
                        track.status.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
            }
            Text(
                "${formatDistance(track.distanceM)} · ${formatDuration(track.durationMs)} · ${track.pointCount} pts",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onShowOnMap) {
            Icon(Icons.Filled.Map, contentDescription = "Show on map")
        }
        if (!track.isActive) {
            var showShare by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { showShare = true }) {
                    Icon(Icons.Filled.Share, contentDescription = "Share GPX")
                }
                DropdownMenu(expanded = showShare, onDismissRequest = { showShare = false }) {
                    DropdownMenuItem(
                        text = { Text("Share original") },
                        onClick = {
                            showShare = false
                            shareGpx(context, recorder, track, LocationRecorder.ShareVariant.Original)
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Share smoothed") },
                        onClick = {
                            showShare = false
                            shareGpx(context, recorder, track, LocationRecorder.ShareVariant.Smoothed)
                        },
                    )
                }
            }
        }
        IconButton(onClick = onDelete) {
            Icon(Icons.Filled.Delete, contentDescription = "Delete track")
        }
    }
}

private fun shareGpx(
    context: android.content.Context,
    recorder: LocationRecorder,
    track: TrackEntity,
    variant: LocationRecorder.ShareVariant,
) {
    val uri = recorder.shareUri(track, variant) ?: return
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "application/gpx+xml"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, "Share GPX"))
}
