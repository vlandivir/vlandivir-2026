import SwiftUI

struct ArchiveView: View {
    @ObservedObject var store: GtdStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(store.archiveTasks) { task in
                NavigationLink {
                    ArchiveTaskDetailView(store: store, task: task)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(task.content)
                            .lineLimit(3)
                        HStack {
                            Text(statusLabel(task.status))
                                .font(.caption.weight(.semibold))
                            if let updated = task.updatedAt {
                                Text(updated.prefix(16))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .overlay {
                if store.archiveTasks.isEmpty {
                    ContentUnavailableView("Archive empty", systemImage: "archivebox")
                }
            }
            .navigationTitle("Archive")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await store.loadArchive() }
        }
    }
}

struct ArchiveTaskDetailView: View {
    @ObservedObject var store: GtdStore
    let task: GtdTaskDTO

    @State private var details: TaskDetailsResponse?
    @State private var loadError: String?
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(statusLabel(task.status))
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(Capsule())

                Text(task.content)
                    .font(.title3.weight(.semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)

                TaskAttachmentsView(
                    attachments: details?.attachments ?? task.attachments ?? [],
                    api: store.api
                )

                Divider()

                Text("History")
                    .font(.headline)

                if isLoading && details == nil {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                } else if let loadError, details == nil {
                    Text(loadError)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else if let details {
                    if details.events.isEmpty {
                        Text("No events")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(details.events) { event in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(event.title)
                                        .font(.subheadline.weight(.semibold))
                                    Text(event.formattedDate)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .padding(.leading, 10)
                                .overlay(alignment: .leading) {
                                    Rectangle()
                                        .fill(Color(.separator))
                                        .frame(width: 2)
                                }
                            }
                        }
                    }
                }
            }
            .padding(20)
        }
        .navigationTitle("Task")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            isLoading = true
            defer { isLoading = false }
            do {
                details = try await store.api.taskDetails(id: task.id)
            } catch {
                loadError = error.localizedDescription
            }
        }
    }
}

private func statusLabel(_ status: String) -> String {
    switch status {
    case "COMPLETED": return "Completed"
    case "CANCELED": return "Canceled"
    default: return status
    }
}
