import SwiftUI

struct TaskEditorView: View {
    enum Mode {
        case create
        case edit(GtdTaskDTO)
    }

    @ObservedObject var store: GtdStore
    let mode: Mode
    @Environment(\.dismiss) private var dismiss

    @State private var content = ""
    @State private var projectId: String?
    @State private var dueDateEnabled = false
    @State private var dueDate = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    TextField("What needs doing?", text: $content, axis: .vertical)
                        .lineLimit(4...10)
                }
                Section("Project") {
                    Picker("Project", selection: $projectId) {
                        Text("Inbox").tag(String?.none)
                        ForEach(store.projects.filter { !($0.archived ?? false) }) { project in
                            Text(project.name).tag(Optional(project.id))
                        }
                    }
                }
                Section("Due date") {
                    Toggle("Set due date", isOn: $dueDateEnabled)
                    if dueDateEnabled {
                        DatePicker(
                            "Due",
                            selection: $dueDate,
                            displayedComponents: .date
                        )
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear(perform: load)
        }
    }

    private var title: String {
        switch mode {
        case .create: return "New task"
        case .edit: return "Edit task"
        }
    }

    private func load() {
        switch mode {
        case .create:
            break
        case .edit(let task):
            content = task.content
            projectId = task.projectId
            if let due = task.dueDate, let parsed = ISO8601.parse(due) {
                dueDateEnabled = true
                dueDate = parsed
            }
        }
    }

    private func save() {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        let due: String? = dueDateEnabled ? Self.dueString(dueDate) : nil
        Task {
            switch mode {
            case .create:
                await store.createTask(content: trimmed, projectId: projectId, dueDate: due)
            case .edit(let task):
                await store.updateTask(
                    id: task.id,
                    content: trimmed,
                    projectId: projectId,
                    dueDate: due
                )
            }
            dismiss()
        }
    }

    private static func dueString(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            c.year ?? 0,
            c.month ?? 0,
            c.day ?? 0
        )
    }
}
