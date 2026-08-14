import SwiftData
import SwiftUI

struct TrackListView: View {
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Track.startedAt, order: .reverse) private var tracks: [Track]
    @ObservedObject var recorder: LocationRecorder
    let onShowOnMap: (Track) -> Void

    @State private var trackPendingDelete: Track?
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            Group {
                if tracks.isEmpty {
                    ContentUnavailableView(
                        "No tracks yet",
                        systemImage: "point.topleft.down.to.point.bottomright.curvepath",
                        description: Text("Start recording to create a GPX track.")
                    )
                } else {
                    List {
                        ForEach(tracks, id: \.id) { track in
                            trackRow(track)
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                    Button {
                                        showOnMap(track)
                                    } label: {
                                        Label("Show on Map", systemImage: "map")
                                    }
                                    .tint(.blue)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        askToDelete(track)
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                .contextMenu {
                                    Button {
                                        showOnMap(track)
                                    } label: {
                                        Label("Show on Map", systemImage: "map")
                                    }
                                    if !track.isActive {
                                        if let original = recorder.shareFileURL(for: track, variant: .original) {
                                            ShareLink(item: original) {
                                                Label("Share original GPX", systemImage: "doc")
                                            }
                                        }
                                        if let smoothed = recorder.shareFileURL(
                                            for: track,
                                            variant: .smoothed
                                        ) {
                                            ShareLink(item: smoothed) {
                                                Label("Share smoothed GPX", systemImage: "wand.and.stars")
                                            }
                                        }
                                    }
                                    Button(role: .destructive) {
                                        askToDelete(track)
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    }
                }
            }
            .navigationTitle("Tracks")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .alert(
                "Delete track?",
                isPresented: $showDeleteConfirmation,
                presenting: trackPendingDelete
            ) { track in
                Button("Cancel", role: .cancel) {
                    trackPendingDelete = nil
                }
                Button("Delete", role: .destructive) {
                    recorder.delete(track)
                    trackPendingDelete = nil
                }
            } message: { track in
                Text("“\(track.name)” and its GPX file will be removed. This cannot be undone.")
            }
        }
    }

    @ViewBuilder
    private func trackRow(_ track: Track) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(track.name)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    if track.isActive {
                        Text(track.status.capitalized)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.orange.opacity(0.2), in: Capsule())
                            .foregroundStyle(.orange)
                    }
                }
                Text(metaLine(for: track))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                showOnMap(track)
            } label: {
                Image(systemName: "map")
                    .font(.body.weight(.semibold))
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Show on map")

            if !track.isActive {
                ShareGPXButton(track: track, recorder: recorder)
            }

            Button(role: .destructive) {
                askToDelete(track)
            } label: {
                Image(systemName: "trash")
                    .font(.body.weight(.semibold))
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Delete track")
        }
        .padding(.vertical, 2)
    }

    private func askToDelete(_ track: Track) {
        trackPendingDelete = track
        showDeleteConfirmation = true
    }

    private func showOnMap(_ track: Track) {
        onShowOnMap(track)
        dismiss()
    }

    private func metaLine(for track: Track) -> String {
        let distance = Self.formatDistance(track.distanceM)
        let duration = Self.formatDuration(track.duration)
        let points = "\(track.pointCount) pts"
        return "\(distance) · \(duration) · \(points)"
    }

    private static func formatDistance(_ meters: Double) -> String {
        if meters >= 1000 {
            return String(format: "%.2f km", meters / 1000)
        }
        return String(format: "%.0f m", meters)
    }

    private static func formatDuration(_ interval: TimeInterval) -> String {
        let total = Int(interval)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%d:%02d", m, s)
    }
}
