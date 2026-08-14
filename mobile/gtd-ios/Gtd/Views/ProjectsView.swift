import SwiftUI

struct ProjectsView: View {
    @ObservedObject var store: GtdStore
    @Environment(\.dismiss) private var dismiss
    @State private var newName = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("New project", text: $newName)
                        Button("Add") {
                            let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !name.isEmpty else { return }
                            Task {
                                await store.createProject(name: name)
                                newName = ""
                            }
                        }
                        .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                Section("Active") {
                    ForEach(store.projects.filter { !($0.archived ?? false) }) { project in
                        HStack {
                            Text(project.name)
                            Spacer()
                            Button("Open") {
                                Task {
                                    await store.setScope(.project, projectId: project.id)
                                    dismiss()
                                }
                            }
                            .buttonStyle(.bordered)
                            Button("Archive", role: .destructive) {
                                Task { await store.setProjectArchived(id: project.id, archived: true) }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                Section("Archived") {
                    ForEach(store.projects.filter { $0.archived ?? false }) { project in
                        HStack {
                            Text(project.name)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button("Restore") {
                                Task { await store.setProjectArchived(id: project.id, archived: false) }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Projects")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
