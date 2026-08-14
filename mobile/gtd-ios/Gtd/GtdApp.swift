import SwiftData
import SwiftUI

@main
struct GtdApp: App {
    @StateObject private var store: GtdStore
    private let container: ModelContainer

    init() {
        let schema = Schema([
            LocalProject.self,
            LocalTask.self,
            PendingMutation.self,
            SyncMeta.self,
        ])
        let configuration = ModelConfiguration(
            "GtdLocal",
            isStoredInMemoryOnly: false
        )
        let container: ModelContainer
        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("SwiftData container failed: \(error)")
        }
        self.container = container

        let auth = AuthService()
        let store = GtdStore(auth: auth)
        store.attach(modelContext: container.mainContext)
        _store = StateObject(wrappedValue: store)
    }

    var body: some Scene {
        WindowGroup {
            RootView(store: store)
                .modelContainer(container)
        }
    }
}

struct RootView: View {
    @ObservedObject var store: GtdStore
    @ObservedObject private var auth: AuthService

    init(store: GtdStore) {
        self.store = store
        _auth = ObservedObject(wrappedValue: store.auth)
    }

    var body: some View {
        Group {
            if auth.isSignedIn {
                HomeView(store: store)
            } else {
                LoginView(auth: auth)
            }
        }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn {
                Task { await store.bootstrap() }
            }
        }
    }
}
