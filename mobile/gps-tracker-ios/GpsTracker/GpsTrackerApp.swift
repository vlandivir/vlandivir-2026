import SwiftData
import SwiftUI

@main
struct GpsTrackerApp: App {
    @StateObject private var recorder = LocationRecorder()
    private let container: ModelContainer

    init() {
        let schema = Schema([Track.self])
        let configuration = ModelConfiguration(
            "GpsTrackerLocal",
            isStoredInMemoryOnly: false
        )
        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("SwiftData container failed: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            MapHomeView(recorder: recorder)
                .modelContainer(container)
                .onAppear {
                    recorder.attach(modelContext: container.mainContext)
                }
        }
    }
}
