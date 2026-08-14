import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: GtdStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let identity = store.identity {
                        LabeledContent("Provider", value: identity.provider)
                        if let name = identity.displayName {
                            LabeledContent("Name", value: name)
                        }
                        LabeledContent("Linked", value: identity.linked ? "Yes" : "No")
                    } else {
                        Text("Signed in")
                    }
                    Button("Sign out", role: .destructive) {
                        store.auth.signOut()
                        dismiss()
                    }
                }
                Section("Sync") {
                    LabeledContent("Status", value: store.syncLabel)
                    LabeledContent("Pending", value: "\(store.pendingCount)")
                    Button("Sync now") {
                        Task {
                            await store.sync?.syncNow()
                            await store.bootstrap()
                        }
                    }
                }
                Section("API") {
                    Text(APIConfig.baseURL.absoluteString)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
