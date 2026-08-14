import SwiftUI

struct ShareGPXButton: View {
    let track: Track
    @ObservedObject var recorder: LocationRecorder

    var body: some View {
        Menu {
            if let original = recorder.shareFileURL(for: track, variant: .original) {
                ShareLink(item: original) {
                    Label("Share original", systemImage: "doc")
                }
            }
            if let smoothed = recorder.shareFileURL(for: track, variant: .smoothed) {
                ShareLink(item: smoothed) {
                    Label("Share smoothed", systemImage: "wand.and.stars")
                }
            }
        } label: {
            Image(systemName: "square.and.arrow.up")
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
        }
        .accessibilityLabel("Share \(track.name)")
    }
}
