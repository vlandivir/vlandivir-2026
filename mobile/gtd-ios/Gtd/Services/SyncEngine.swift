import Foundation
import SwiftData

enum SyncStatus: Equatable {
    case idle
    case syncing
    case offline(pending: Int)
    case error(String)

    var label: String {
        switch self {
        case .idle: return "Online"
        case .syncing: return "Syncing…"
        case .offline(let pending):
            return pending > 0 ? "Offline (\(pending))" : "Offline"
        case .error(let message): return message
        }
    }
}

@MainActor
final class SyncEngine: ObservableObject {
    @Published private(set) var status: SyncStatus = .idle
    @Published private(set) var pendingCount = 0

    private let api: APIClient
    private let modelContext: ModelContext
    private var isRunning = false

    init(api: APIClient, modelContext: ModelContext) {
        self.api = api
        self.modelContext = modelContext
        refreshPendingCount()
    }

    func refreshPendingCount() {
        let descriptor = FetchDescriptor<PendingMutation>(
            sortBy: [SortDescriptor(\.createdAt)]
        )
        pendingCount = (try? modelContext.fetch(descriptor))?.count ?? 0
    }

    func enqueue(_ kind: MutationKind, payload: some Encodable) throws {
        let data = try JSONEncoder().encode(payload)
        modelContext.insert(PendingMutation(kind: kind, payloadJSON: data))
        try modelContext.save()
        refreshPendingCount()
    }

    func syncNow() async {
        guard !isRunning else { return }
        isRunning = true
        status = .syncing
        defer { isRunning = false }

        do {
            try await pushOutbox()
            try await pullRemote()
            refreshPendingCount()
            status = pendingCount > 0 ? .offline(pending: pendingCount) : .idle
        } catch let error as APIError {
            if case .unauthorized = error {
                status = .error("Signed out")
            } else if case .transport = error {
                refreshPendingCount()
                status = .offline(pending: pendingCount)
            } else {
                status = .error(error.localizedDescription)
            }
        } catch {
            refreshPendingCount()
            status = .offline(pending: pendingCount)
        }
    }

    // MARK: - Push

    private func pushOutbox() async throws {
        let descriptor = FetchDescriptor<PendingMutation>(
            sortBy: [SortDescriptor(\.createdAt)]
        )
        let mutations = try modelContext.fetch(descriptor)
        for mutation in mutations {
            do {
                try await applyRemote(mutation)
                modelContext.delete(mutation)
                try modelContext.save()
            } catch let error as APIError {
                if case .unauthorized = error { throw error }
                if case .transport = error { throw error }
                // Server rejected (conflict / validation) — drop and refresh
                mutation.retries += 1
                mutation.lastError = error.localizedDescription
                if mutation.retries >= 3 {
                    modelContext.delete(mutation)
                }
                try modelContext.save()
            }
        }
        refreshPendingCount()
    }

    private func applyRemote(_ mutation: PendingMutation) async throws {
        let decoder = JSONDecoder()
        switch mutation.kind {
        case .createTask:
            let payload = try decoder.decode(CreateTaskPayload.self, from: mutation.payloadJSON)
            let task = try await api.createTask(
                content: payload.content,
                projectId: payload.projectId,
                dueDate: payload.dueDate
            )
            upsertTask(task)
            if let localId = payload.localId {
                deleteTask(id: localId)
            }
        case .patchTask:
            let payload = try decoder.decode(PatchTaskPayload.self, from: mutation.payloadJSON)
            let task = try await api.updateTask(
                id: payload.id,
                content: payload.content,
                projectId: payload.projectId,
                dueDate: payload.dueDate
            )
            upsertTask(task)
        case .act:
            let payload = try decoder.decode(ActPayload.self, from: mutation.payloadJSON)
            guard let action = GtdAction(rawValue: payload.action) else { return }
            let task = try await api.act(taskId: payload.taskId, action: action)
            upsertTask(task)
        case .createProject:
            let payload = try decoder.decode(CreateProjectPayload.self, from: mutation.payloadJSON)
            let project = try await api.createProject(name: payload.name)
            upsertProject(project)
            if let localId = payload.localId {
                deleteProject(id: localId)
            }
        case .updateProject:
            let payload = try decoder.decode(UpdateProjectPayload.self, from: mutation.payloadJSON)
            let project = try await api.updateProject(
                id: payload.id,
                name: payload.name,
                archived: payload.archived
            )
            upsertProject(project)
        }
        try modelContext.save()
    }

    // MARK: - Pull

    private func pullRemote() async throws {
        let meta = try metaRow()
        if !meta.seeded {
            try await seedAllActive()
            meta.seeded = true
            meta.lastTaskSyncAt = .now
            meta.lastProjectSyncAt = .now
            try modelContext.save()
            return
        }

        let sinceTasks = meta.lastTaskSyncAt.map(ISO8601.format)
        let sinceProjects = meta.lastProjectSyncAt.map(ISO8601.format)

        var cursor: String?
        var latestTask: Date = meta.lastTaskSyncAt ?? .distantPast
        repeat {
            let page = try await api.listTasks(
                status: "ALL",
                updatedSince: sinceTasks,
                cursor: cursor,
                limit: 100
            )
            for dto in page.tasks {
                upsertTask(dto)
                if let updated = ISO8601.parse(dto.updatedAt), updated > latestTask {
                    latestTask = updated
                }
            }
            cursor = page.nextCursor
        } while cursor != nil

        let projects = try await api.listProjects(updatedSince: sinceProjects)
        var latestProject: Date = meta.lastProjectSyncAt ?? .distantPast
        for dto in projects.projects {
            upsertProject(dto)
            if let updated = ISO8601.parse(dto.updatedAt), updated > latestProject {
                latestProject = updated
            }
        }

        meta.lastTaskSyncAt = latestTask
        meta.lastProjectSyncAt = latestProject
        try modelContext.save()
    }

    private func seedAllActive() async throws {
        var cursor: String?
        repeat {
            let page = try await api.listTasks(status: "ACTIVE", cursor: cursor, limit: 100)
            for dto in page.tasks {
                upsertTask(dto)
            }
            cursor = page.nextCursor
        } while cursor != nil

        let projects = try await api.listProjects()
        for dto in projects.projects {
            upsertProject(dto)
        }
    }

    // MARK: - Local helpers

    func upsertTask(_ dto: GtdTaskDTO) {
        let id = dto.id
        let descriptor = FetchDescriptor<LocalTask>(
            predicate: #Predicate { $0.id == id }
        )
        if let existing = try? modelContext.fetch(descriptor).first {
            // Server is source of truth after pull / successful mutation.
            existing.apply(dto)
        } else {
            modelContext.insert(LocalTask.fromDTO(dto))
        }
        if let project = dto.project {
            upsertProject(project)
        }
    }

    func upsertProject(_ dto: GtdProjectDTO) {
        let id = dto.id
        let descriptor = FetchDescriptor<LocalProject>(
            predicate: #Predicate { $0.id == id }
        )
        if let existing = try? modelContext.fetch(descriptor).first {
            existing.apply(dto)
        } else {
            modelContext.insert(LocalProject.fromDTO(dto))
        }
    }

    func deleteTask(id: String) {
        let descriptor = FetchDescriptor<LocalTask>(
            predicate: #Predicate { $0.id == id }
        )
        if let existing = try? modelContext.fetch(descriptor).first {
            modelContext.delete(existing)
        }
    }

    func deleteProject(id: String) {
        let descriptor = FetchDescriptor<LocalProject>(
            predicate: #Predicate { $0.id == id }
        )
        if let existing = try? modelContext.fetch(descriptor).first {
            modelContext.delete(existing)
        }
    }

    private func metaRow() throws -> SyncMeta {
        let descriptor = FetchDescriptor<SyncMeta>(
            predicate: #Predicate { $0.id == "default" }
        )
        if let existing = try modelContext.fetch(descriptor).first {
            return existing
        }
        let meta = SyncMeta()
        modelContext.insert(meta)
        try modelContext.save()
        return meta
    }

    // MARK: - Queue selection (mirrors server)

    func currentTask(scope: GtdScope, now: Date = .now) -> LocalTask? {
        let descriptor = FetchDescriptor<LocalTask>(
            predicate: #Predicate { $0.status == "ACTIVE" }
        )
        guard let tasks = try? modelContext.fetch(descriptor) else { return nil }

        let filtered = tasks.filter { task in
            if let snoozed = task.snoozedUntil, snoozed > now { return false }
            switch scope.kind {
            case .all:
                return true
            case .inbox:
                return task.projectId == nil
            case .project:
                return task.projectId == scope.projectId
            case .today:
                guard let due = task.dueDate else { return false }
                let tomorrow = Calendar.current.startOfDay(for: now).addingTimeInterval(86_400)
                return due < tomorrow
            }
        }

        return filtered.sorted { lhs, rhs in
            if scope.kind == .today {
                let ld = lhs.dueDate ?? .distantFuture
                let rd = rhs.dueDate ?? .distantFuture
                if ld != rd { return ld < rd }
            }
            let lo = Int64(lhs.orderKey) ?? 0
            let ro = Int64(rhs.orderKey) ?? 0
            if lo != ro { return lo < ro }
            return lhs.id < rhs.id
        }.first
    }

    func activeProjects() -> [LocalProject] {
        let descriptor = FetchDescriptor<LocalProject>(
            sortBy: [SortDescriptor(\.name)]
        )
        let all = (try? modelContext.fetch(descriptor)) ?? []
        return all.filter { !$0.isArchived }
    }

    func allProjects() -> [LocalProject] {
        let descriptor = FetchDescriptor<LocalProject>(
            sortBy: [SortDescriptor(\.name)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }
}

// MARK: - Outbox payloads

struct CreateTaskPayload: Codable {
    var localId: String?
    var content: String
    var projectId: String?
    var dueDate: String?
}

struct PatchTaskPayload: Codable {
    var id: String
    var content: String?
    /// Nested optional: omit / set / clear
    var projectId: String??
    var dueDate: String??

    enum CodingKeys: String, CodingKey {
        case id, content, projectId, dueDate
    }

    init(id: String, content: String?, projectId: String??, dueDate: String??) {
        self.id = id
        self.content = content
        self.projectId = projectId
        self.dueDate = dueDate
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        content = try c.decodeIfPresent(String.self, forKey: .content)
        if c.contains(.projectId) {
            projectId = try c.decodeIfPresent(String.self, forKey: .projectId)
        } else {
            projectId = nil
        }
        if c.contains(.dueDate) {
            dueDate = try c.decodeIfPresent(String.self, forKey: .dueDate)
        } else {
            dueDate = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(content, forKey: .content)
        if let projectId {
            try c.encode(projectId, forKey: .projectId)
        }
        if let dueDate {
            try c.encode(dueDate, forKey: .dueDate)
        }
    }
}

struct ActPayload: Codable {
    var taskId: String
    var action: String
}

struct CreateProjectPayload: Codable {
    var localId: String?
    var name: String
}

struct UpdateProjectPayload: Codable {
    var id: String
    var name: String?
    var archived: Bool?
}
