import Foundation
import SwiftData

@Model
final class LocalProject {
    @Attribute(.unique) var id: String
    var name: String
    var archivedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String,
        name: String,
        archivedAt: Date? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.archivedAt = archivedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var isArchived: Bool { archivedAt != nil }

    static func fromDTO(_ dto: GtdProjectDTO) -> LocalProject {
        LocalProject(
            id: dto.id,
            name: dto.name,
            archivedAt: ISO8601.parse(dto.archivedAt),
            createdAt: ISO8601.parse(dto.createdAt) ?? .now,
            updatedAt: ISO8601.parse(dto.updatedAt) ?? .now
        )
    }

    func apply(_ dto: GtdProjectDTO) {
        name = dto.name
        archivedAt = ISO8601.parse(dto.archivedAt)
        if let created = ISO8601.parse(dto.createdAt) { createdAt = created }
        if let updated = ISO8601.parse(dto.updatedAt) { updatedAt = updated }
    }
}

@Model
final class LocalTask {
    @Attribute(.unique) var id: String
    var projectId: String?
    var content: String
    var status: String
    var orderKey: String
    var dueDate: Date?
    var snoozedUntil: Date?
    var completedAt: Date?
    var canceledAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var attachmentCount: Int

    init(
        id: String,
        projectId: String? = nil,
        content: String,
        status: String = "ACTIVE",
        orderKey: String,
        dueDate: Date? = nil,
        snoozedUntil: Date? = nil,
        completedAt: Date? = nil,
        canceledAt: Date? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        attachmentCount: Int = 0
    ) {
        self.id = id
        self.projectId = projectId
        self.content = content
        self.status = status
        self.orderKey = orderKey
        self.dueDate = dueDate
        self.snoozedUntil = snoozedUntil
        self.completedAt = completedAt
        self.canceledAt = canceledAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.attachmentCount = attachmentCount
    }

    static func fromDTO(_ dto: GtdTaskDTO) -> LocalTask {
        LocalTask(
            id: dto.id,
            projectId: dto.projectId,
            content: dto.content,
            status: dto.status,
            orderKey: dto.orderKey,
            dueDate: ISO8601.parse(dto.dueDate),
            snoozedUntil: ISO8601.parse(dto.snoozedUntil),
            completedAt: ISO8601.parse(dto.completedAt),
            canceledAt: ISO8601.parse(dto.canceledAt),
            createdAt: ISO8601.parse(dto.createdAt) ?? .now,
            updatedAt: ISO8601.parse(dto.updatedAt) ?? .now,
            attachmentCount: dto.attachments?.count ?? 0
        )
    }

    func apply(_ dto: GtdTaskDTO) {
        projectId = dto.projectId
        content = dto.content
        status = dto.status
        orderKey = dto.orderKey
        dueDate = ISO8601.parse(dto.dueDate)
        snoozedUntil = ISO8601.parse(dto.snoozedUntil)
        completedAt = ISO8601.parse(dto.completedAt)
        canceledAt = ISO8601.parse(dto.canceledAt)
        if let created = ISO8601.parse(dto.createdAt) { createdAt = created }
        if let updated = ISO8601.parse(dto.updatedAt) { updatedAt = updated }
        attachmentCount = dto.attachments?.count ?? attachmentCount
    }

    func asDTO(project: LocalProject? = nil) -> GtdTaskDTO {
        GtdTaskDTO(
            id: id,
            workspaceId: nil,
            projectId: projectId,
            content: content,
            status: status,
            orderKey: orderKey,
            dueDate: dueDate.map(ISO8601.format) ,
            snoozedUntil: snoozedUntil.map(ISO8601.format),
            completedAt: completedAt.map(ISO8601.format),
            canceledAt: canceledAt.map(ISO8601.format),
            createdAt: ISO8601.format(createdAt),
            updatedAt: ISO8601.format(updatedAt),
            project: project.map {
                GtdProjectDTO(
                    id: $0.id,
                    workspaceId: nil,
                    name: $0.name,
                    archivedAt: $0.archivedAt.map(ISO8601.format),
                    archived: $0.isArchived,
                    createdAt: ISO8601.format($0.createdAt),
                    updatedAt: ISO8601.format($0.updatedAt)
                )
            },
            attachments: nil
        )
    }
}

enum MutationKind: String, Codable {
    case createTask
    case patchTask
    case act
    case createProject
    case updateProject
}

@Model
final class PendingMutation {
    @Attribute(.unique) var id: String
    var kindRaw: String
    var payloadJSON: Data
    var createdAt: Date
    var retries: Int
    var lastError: String?

    init(
        id: String = UUID().uuidString,
        kind: MutationKind,
        payloadJSON: Data,
        createdAt: Date = .now,
        retries: Int = 0,
        lastError: String? = nil
    ) {
        self.id = id
        self.kindRaw = kind.rawValue
        self.payloadJSON = payloadJSON
        self.createdAt = createdAt
        self.retries = retries
        self.lastError = lastError
    }

    var kind: MutationKind {
        get { MutationKind(rawValue: kindRaw) ?? .act }
        set { kindRaw = newValue.rawValue }
    }
}

@Model
final class SyncMeta {
    @Attribute(.unique) var id: String
    var lastTaskSyncAt: Date?
    var lastProjectSyncAt: Date?
    var seeded: Bool

    init(
        id: String = "default",
        lastTaskSyncAt: Date? = nil,
        lastProjectSyncAt: Date? = nil,
        seeded: Bool = false
    ) {
        self.id = id
        self.lastTaskSyncAt = lastTaskSyncAt
        self.lastProjectSyncAt = lastProjectSyncAt
        self.seeded = seeded
    }
}

enum ISO8601 {
    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let basic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        return fractional.date(from: value) ?? basic.date(from: value)
    }

    static func format(_ date: Date) -> String {
        fractional.string(from: date)
    }
}
