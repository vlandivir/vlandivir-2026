import SwiftUI

struct HomeView: View {
    @ObservedObject var store: GtdStore
    @State private var showCreate = false
    @State private var showEdit = false
    @State private var showProjects = false
    @State private var showArchive = false
    @State private var showSettings = false
    @State private var showSnooze = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                scopeBar
                Divider()
                taskCard
                actionBar
            }
            .navigationTitle("GTD")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text(store.syncLabel)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showCreate = true } label: {
                        Image(systemName: "plus")
                    }
                    Button { showProjects = true } label: {
                        Image(systemName: "folder")
                    }
                    Button { showArchive = true } label: {
                        Image(systemName: "archivebox")
                    }
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .task { await store.bootstrap() }
            .refreshable { await store.bootstrap() }
            .sheet(isPresented: $showCreate) {
                TaskEditorView(store: store, mode: .create)
            }
            .sheet(isPresented: $showEdit) {
                if let task = store.currentTask {
                    TaskEditorView(store: store, mode: .edit(task))
                }
            }
            .sheet(isPresented: $showProjects) {
                ProjectsView(store: store)
            }
            .sheet(isPresented: $showArchive) {
                ArchiveView(store: store)
            }
            .sheet(isPresented: $showSettings) {
                SettingsView(store: store)
            }
            .confirmationDialog("Snooze", isPresented: $showSnooze, titleVisibility: .visible) {
                ForEach(GtdAction.snoozePresets) { action in
                    Button(action.title) {
                        Task { await store.perform(action) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
            .alert(
                "Error",
                isPresented: Binding(
                    get: { store.errorMessage != nil },
                    set: { if !$0 { store.errorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) { store.errorMessage = nil }
            } message: {
                Text(store.errorMessage ?? "")
            }
        }
    }

    private var scopeBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach([GtdScopeKind.all, .inbox, .today], id: \.self) { kind in
                    scopeChip(kind.title, selected: store.scope.kind == kind && kind != .project) {
                        Task { await store.setScope(kind) }
                    }
                }
                ForEach(store.projects.filter { !($0.archived ?? false) }) { project in
                    scopeChip(
                        project.name,
                        selected: store.scope.kind == .project && store.scope.projectId == project.id
                    ) {
                        Task { await store.setScope(.project, projectId: project.id) }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }

    private func scopeChip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? Color.accentColor : Color(.secondarySystemBackground))
                .foregroundStyle(selected ? Color.white : Color.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var taskCard: some View {
        Group {
            if store.isLoading && store.currentTask == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let task = store.currentTask {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Text("\(store.counts.available) available · \(store.counts.active) active")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Spacer()
                            if task.attachmentCountHint > 0 {
                                Label("\(task.attachmentCountHint)", systemImage: "paperclip")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Text(task.content)
                            .font(.title2.weight(.semibold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let project = task.project?.name {
                            Label(project, systemImage: "folder")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        if let due = task.dueDate {
                            Label(due.prefix(10), systemImage: "calendar")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Button("Edit") { showEdit = true }
                            .buttonStyle(.bordered)
                    }
                    .padding(24)
                }
            } else {
                ContentUnavailableView(
                    "Inbox zero",
                    systemImage: "checkmark.circle",
                    description: Text("No tasks in this scope. Add one with +.")
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var actionBar: some View {
        HStack(spacing: 12) {
            actionButton("Complete", systemImage: "checkmark.circle.fill", tint: .green) {
                Task { await store.perform(.complete) }
            }
            actionButton("Snooze", systemImage: "moon.zzz", tint: .orange) {
                showSnooze = true
            }
            actionButton("Rotate", systemImage: "arrow.2.squarepath", tint: .blue) {
                Task { await store.perform(.rotate) }
            }
            actionButton("Cancel", systemImage: "xmark.circle", tint: .red) {
                Task { await store.perform(.cancel) }
            }
        }
        .padding()
        .disabled(store.currentTask == nil)
        .background(.bar)
    }

    private func actionButton(
        _ title: String,
        systemImage: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.title2)
                Text(title)
                    .font(.caption2)
            }
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

private extension GtdTaskDTO {
    var attachmentCountHint: Int { attachments?.count ?? 0 }
}
