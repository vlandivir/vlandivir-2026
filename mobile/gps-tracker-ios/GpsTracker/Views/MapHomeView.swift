import CoreLocation
import SwiftData
import SwiftUI
import UIKit

struct MapHomeView: View {
    @ObservedObject var recorder: LocationRecorder
    @State private var showTracks = false
    @State private var selectedTrack: Track?
    @State private var selectedLocations: [CLLocation] = []
    /// Manual only — recording must not auto-center the map.
    @State private var followUser = false
    @State private var selectedVariant: LocationRecorder.ShareVariant = .original

    var body: some View {
        ZStack(alignment: .bottom) {
            OSMMapView(
                userTrackingEnabled: followUser && selectedTrack == nil,
                liveLocations: recorder.liveLocations,
                selectedLocations: selectedLocations,
                selectedTrackID: selectedTrack?.id
            )
            .ignoresSafeArea()

            VStack(spacing: 12) {
                if selectedTrack != nil || recorder.state != .idle {
                    speedLegend
                }

                if selectedTrack != nil {
                    trackVariantPicker
                }

                if let message = recorder.lastError {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.red.opacity(0.85), in: RoundedRectangle(cornerRadius: 10))
                        .padding(.horizontal)
                }

                locationModeChip

                statusChip

                controlBar
            }
            .padding(.bottom, 20)
        }
        .sheet(isPresented: $showTracks) {
            TrackListView(recorder: recorder, onShowOnMap: select)
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Button {
                    showTracks = true
                } label: {
                    Label("Tracks", systemImage: "list.bullet")
                        .labelStyle(.titleAndIcon)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                }

                Spacer()

                Button {
                    followUser = true
                    selectedTrack = nil
                    selectedLocations = []
                    selectedVariant = .original
                } label: {
                    Image(systemName: "location.fill")
                        .padding(10)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .accessibilityLabel("Follow my location")
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    @ViewBuilder
    private var trackVariantPicker: some View {
        Picker("Track version", selection: $selectedVariant) {
            Text("Original").tag(LocationRecorder.ShareVariant.original)
            Text("Smoothed").tag(LocationRecorder.ShareVariant.smoothed)
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 280)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
        .onChange(of: selectedVariant) { _, newValue in
            guard let track = selectedTrack else { return }
            selectedLocations = recorder.locations(for: track, variant: newValue)
        }
    }

    @ViewBuilder
    private var speedLegend: some View {
        HStack(spacing: 6) {
            Text("0")
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
            LinearGradient(
                colors: [
                    Color(red: 0.086, green: 0.639, blue: 0.290),
                    Color(red: 0.133, green: 0.773, blue: 0.369),
                    Color(red: 0.635, green: 0.839, blue: 0.133),
                    Color(red: 0.918, green: 0.702, blue: 0.031),
                    Color(red: 0.976, green: 0.451, blue: 0.086),
                    Color(red: 0.937, green: 0.267, blue: 0.267),
                    Color(red: 0.659, green: 0.333, blue: 0.969),
                    .black,
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: 140, height: 8)
            .clipShape(Capsule())
            Text("5·15·25…200")
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
    }

    @ViewBuilder
    private var locationModeChip: some View {
        let backgroundOn = recorder.isBackgroundRecordingEnabled
        Button {
            if !backgroundOn {
                if recorder.authorizationStatus == .authorizedWhenInUse {
                    recorder.requestAuthorization()
                }
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
        } label: {
            Label(
                backgroundOn
                    ? "Background On · \(recorder.authorizationLabel)"
                    : "Background Off · \(recorder.authorizationLabel)",
                systemImage: backgroundOn ? "location.fill" : "location.slash"
            )
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial, in: Capsule())
            .foregroundStyle(backgroundOn ? Color.primary : Color.orange)
        }
        .buttonStyle(.plain)
        .accessibilityHint(
            backgroundOn
                ? "Always location access is enabled for background recording."
                : "Opens Settings so you can set Location to Always."
        )
    }

    @ViewBuilder
    private var statusChip: some View {
        switch recorder.state {
        case .idle:
            EmptyView()
        case .recording:
            Label(statusText, systemImage: "record.circle")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
        case .paused:
            Label(statusText, systemImage: "pause.circle.fill")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
        }
    }

    private var statusText: String {
        let distance = formatDistance(recorder.distanceM)
        let bg = recorder.isBackgroundRecordingEnabled ? "BG" : "FG"
        return "\(distance) · \(recorder.pointCount) pts · \(bg)"
    }

    private var controlBar: some View {
        HStack(spacing: 16) {
            Button {
                showTracks = true
            } label: {
                controlLabel("List", systemImage: "list.bullet")
            }

            switch recorder.state {
            case .idle:
                Button {
                    selectedTrack = nil
                    selectedLocations = []
                    selectedVariant = .original
                    recorder.start()
                } label: {
                    controlLabel("Start", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)

            case .recording:
                Button {
                    recorder.pause()
                } label: {
                    controlLabel("Pause", systemImage: "pause.fill")
                }
                .buttonStyle(.bordered)

                Button {
                    recorder.stop()
                } label: {
                    controlLabel("Stop", systemImage: "stop.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)

            case .paused:
                Button {
                    recorder.resume()
                } label: {
                    controlLabel("Resume", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    recorder.stop()
                } label: {
                    controlLabel("Stop", systemImage: "stop.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
        .padding(.horizontal, 16)
    }

    private func controlLabel(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.semibold))
            .frame(minWidth: 72)
    }

    private func select(_ track: Track) {
        selectedTrack = track
        selectedVariant = .original
        selectedLocations = recorder.locations(for: track, variant: .original)
        followUser = false
    }

    private func formatDistance(_ meters: Double) -> String {
        if meters >= 1000 {
            return String(format: "%.2f km", meters / 1000)
        }
        return String(format: "%.0f m", meters)
    }
}
