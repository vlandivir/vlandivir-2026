import Foundation
import SwiftData
import SwiftUI

@MainActor
final class GtdStore: ObservableObject {
    @Published var scope: GtdScope = .all
    @Published var currentTask: GtdTaskDTO?
    @Published var projects: [GtdProjectDTO] = []
    @Published var counts = BootstrapResponse.Counts(available: 0, active: 0)
    @Published var identity: GtdIdentityDTO?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var archiveTasks: [GtdTaskDTO] = []

    let auth: AuthService
    let api: APIClient
    private(set) var sync: SyncEngine?
    private var modelContext: ModelContext?

    init(auth: AuthService, api: APIClient = APIClient()) {
        self.auth = auth
        self.api = api
    }

    func attach(modelContext: ModelContext) {
        self.modelContext = modelContext
        self.sync = SyncEngine(api: api, modelContext: modelContext)
    }

    var syncLabel: String {
        sync?.status.label ?? "—"
    }

    var pendingCount: Int {
        sync?.pendingCount ?? 0
    }

    func bootstrap() async {
        guard auth.isSignedIn else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if let sync {
            await sync.syncNow()
            refreshFromLocal()
        }

        do {
            let response = try await api.bootstrap(scope: scope)
            identity = response.identity
            projects = response.projects
            currentTask = response.currentTask
            counts = response.counts
            if let sync {
                for project in response.projects {
                    sync.upsertProject(project)
                }
                if let task = response.currentTask {
                    sync.upsertTask(task)
                }
                try? modelContext?.save()
            }
        } catch let error as APIError {
            if case .unauthorized = error {
                auth.signOut()
                errorMessage = error.localizedDescription
                return
            }
            if case .transport = error {
                refreshFromLocal()
                return
            }
            errorMessage = error.localizedDescription
            refreshFromLocal()
        } catch {
            errorMessage = error.localizedDescription
            refreshFromLocal()
        }
    }

    func refreshFromLocal() {
        guard let sync else { return }
        projects = sync.allProjects().map {
            GtdProjectDTO(
                id: $0.id,
                workspaceId: nil,
                name: $0.name,
                archivedAt: $0.archivedAt.map(ISO8601.format),
                archived: $0.isArchived,
                createdAt: ISO8601.format($0.createdAt),
                updatedAt: ISO8601.format($0.updatedAt)
            )
        }
        if let local = sync.currentTask(scope: scope) {
            let project = local.projectId.flatMap { id in
                sync.allProjects().first { $0.id == id }
            }
            currentTask = local.asDTO(project: project)
        } else {
            currentTask = nil
        }
        let active = (try? modelContext?.fetch(
            FetchDescriptor<LocalTask>(predicate: #Predicate { $0.status == "ACTIVE" })
        )) ?? []
        let available = active.filter { task in
            if let snoozed = task.snoozedUntil, snoozed > Date() { return false }
            return true
        }
        counts = .init(available: available.count, active: active.count)
    }

    func setScope(_ kind: GtdScopeKind, projectId: String? = nil) async {
        scope = GtdScope(kind: kind, projectId: projectId)
        await bootstrap()
    }

    func perform(_ action: GtdAction) async {
        guard let task = currentTask else { return }
        applyOptimisticAction(taskId: task.id, action: action)
        refreshFromLocal()

        do {
            try sync?.enqueue(.act, payload: ActPayload(taskId: task.id, action: action.rawValue))
            await sync?.syncNow()
            await bootstrap()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createTask(content: String, projectId: String?, dueDate: String?) async {
        let localId = "local-\(UUID().uuidString)"
        let local = LocalTask(
            id: localId,
            projectId: projectId,
            content: content,
            orderKey: "0",
            dueDate: ISO8601.parse(dueDate)
        )
        modelContext?.insert(local)
        try? modelContext?.save()
        refreshFromLocal()

        do {
            try sync?.enqueue(
                .createTask,
                payload: CreateTaskPayload(
                    localId: localId,
                    content: content,
                    projectId: projectId,
                    dueDate: dueDate
                )
            )
            await sync?.syncNow()
            await bootstrap()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateTask(id: String, content: String, projectId: String?, dueDate: String?) async {
        if let sync {
            let taskId = id
            let descriptor = FetchDescriptor<LocalTask>(predicate: #Predicate { $0.id == taskId })
            if let existing = try? modelContext?.fetch(descriptor).first {
                existing.content = content
                existing.projectId = projectId
                existing.dueDate = ISO8601.parse(dueDate)
                existing.updatedAt = .now
                try? modelContext?.save()
            }
            refreshFromLocal()
            do {
                try sync.enqueue(
                    .patchTask,
                    payload: PatchTaskPayload(
                        id: id,
                        content: content,
                        projectId: .some(projectId),
                        dueDate: .some(dueDate)
                    )
                )
                await sync.syncNow()
                await bootstrap()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func createProject(name: String) async {
        do {
            try sync?.enqueue(
                .createProject,
                payload: CreateProjectPayload(name: name)
            )
            await sync?.syncNow()
            await bootstrap()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setProjectArchived(id: String, archived: Bool) async {
        do {
            try sync?.enqueue(
                .updateProject,
                payload: UpdateProjectPayload(id: id, name: nil, archived: archived)
            )
            await sync?.syncNow()
            await bootstrap()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadArchive() async {
        do {
            let response = try await api.archive()
            archiveTasks = response.tasks
        } catch {
            // Fall back to local completed/canceled
            let descriptor = FetchDescriptor<LocalTask>(
                sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
            )
            let all = (try? modelContext?.fetch(descriptor)) ?? []
            archiveTasks = all
                .filter { $0.status == "COMPLETED" || $0.status == "CANCELED" }
                .prefix(50)
                .map { $0.asDTO() }
            if archiveTasks.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func applyOptimisticAction(taskId: String, action: GtdAction) {
        let id = taskId
        let descriptor = FetchDescriptor<LocalTask>(predicate: #Predicate { $0.id == id })
        guard let task = try? modelContext?.fetch(descriptor).first else { return }
        switch action {
        case .complete:
            task.status = "COMPLETED"
            task.completedAt = .now
            task.updatedAt = .now
        case .cancel:
            task.status = "CANCELED"
            task.canceledAt = .now
            task.updatedAt = .now
        case .rotate:
            // Push to back with a high order key string (lexicographic approx)
            if let maxKey = ((try? modelContext?.fetch(
                FetchDescriptor<LocalTask>(predicate: #Predicate { $0.status == "ACTIVE" })
            )) ?? []).compactMap({ Int64($0.orderKey) }).max() {
                task.orderKey = String(maxKey + 1)
            }
            task.updatedAt = .now
        default:
            // Snooze presets — approximate locally; server is source of truth after sync
            task.snoozedUntil = approximateSnooze(action)
            task.updatedAt = .now
        }
        try? modelContext?.save()
    }

    private func approximateSnooze(_ action: GtdAction) -> Date {
        let now = Date()
        switch action {
        case .snoozeHour: return now.addingTimeInterval(3600)
        case .snoozeHours2: return now.addingTimeInterval(7200)
        case .snoozeHours4: return now.addingTimeInterval(14_400)
        case .snoozeTomorrow: return Calendar.current.date(byAdding: .day, value: 1, to: now) ?? now
        case .snoozeDays2: return Calendar.current.date(byAdding: .day, value: 2, to: now) ?? now
        case .snoozeDays7: return Calendar.current.date(byAdding: .day, value: 7, to: now) ?? now
        case .snoozeDays14: return Calendar.current.date(byAdding: .day, value: 14, to: now) ?? now
        case .snoozeDays30: return Calendar.current.date(byAdding: .day, value: 30, to: now) ?? now
        default: return now.addingTimeInterval(3600)
        }
    }
}
