import SwiftUI
import UIKit

struct SettingsView: View {
    @ObservedObject var store: GtdStore
    @Environment(\.dismiss) private var dismiss
    @State private var mcp: GtdMcpTokenDTO?
    @State private var mcpError: String?
    @State private var mcpBusy = false
    @State private var confirmRotate = false
    @State private var copied = false

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
                Section {
                    if let mcp {
                        Text(mcp.token)
                            .font(.footnote.monospaced())
                            .textSelection(.enabled)
                        LabeledContent("URL", value: mcp.url)
                        Button(copied ? "Copied" : "Copy key") {
                            UIPasteboard.general.string = mcp.token
                            copied = true
                        }
                        Button("Issue a new key", role: .destructive) {
                            confirmRotate = true
                        }
                        .disabled(mcpBusy)
                    } else if let mcpError {
                        Text(mcpError)
                            .foregroundStyle(.red)
                        Button("Retry") {
                            Task { await loadMcpToken() }
                        }
                    } else {
                        ProgressView()
                    }
                } header: {
                    Text("MCP key")
                } footer: {
                    Text("For Cursor and other agents: Authorization Bearer, no X-Chat-Id. Same key as in Telegram /gtdkey.")
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
            .task { await loadMcpToken() }
            .alert("Replace MCP key?", isPresented: $confirmRotate) {
                Button("Replace", role: .destructive) {
                    Task { await rotateMcpToken() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The old key will stop working for every client.")
            }
        }
    }

    private func loadMcpToken() async {
        mcpError = nil
        do {
            mcp = try await store.api.mcpToken()
        } catch {
            mcpError = error.localizedDescription
        }
    }

    private func rotateMcpToken() async {
        mcpBusy = true
        defer { mcpBusy = false }
        do {
            mcp = try await store.api.regenerateMcpToken()
            copied = false
        } catch {
            mcpError = error.localizedDescription
        }
    }
}
