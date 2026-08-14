import SwiftUI

struct ArchiveView: View {
    @ObservedObject var store: GtdStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(store.archiveTasks) { task in
                VStack(alignment: .leading, spacing: 4) {
                    Text(task.content)
                        .lineLimit(3)
                    HStack {
                        Text(task.status)
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
