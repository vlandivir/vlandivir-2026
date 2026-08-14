import Foundation

enum APIConfig {
    static let baseURL = URL(string: "https://vlandivir.com")!
    static let callbackScheme = "vlandivir-gtd"
    static let callbackHost = "auth"
    static var callbackURL: URL {
        URL(string: "\(callbackScheme)://\(callbackHost)")!
    }
}

struct SessionUser: Codable, Equatable {
    var email: String
    var name: String?
}

enum GtdScopeKind: String, Codable, CaseIterable, Identifiable {
    case all
    case inbox
    case project
    case today

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "All"
        case .inbox: return "Inbox"
        case .project: return "Project"
        case .today: return "Today"
        }
    }
}

struct GtdScope: Equatable {
    var kind: GtdScopeKind
    var projectId: String?

    static let all = GtdScope(kind: .all, projectId: nil)
}

struct GtdIdentityDTO: Codable, Equatable {
    var provider: String
    var displayName: String?
    var linked: Bool
    var providers: [String]
}

struct GtdProjectDTO: Codable, Equatable, Identifiable {
    var id: String
    var workspaceId: String?
    var name: String
    var archivedAt: String?
    var archived: Bool?
    var createdAt: String?
    var updatedAt: String?
}

struct GtdAttachmentDTO: Codable, Equatable, Identifiable {
    var id: String
    var taskId: String?
    var originalName: String
    var mimeType: String
    var size: Int
    var createdAt: String?
}

struct GtdTaskDTO: Codable, Equatable, Identifiable {
    var id: String
    var workspaceId: String?
    var projectId: String?
    var content: String
    var status: String
    var orderKey: String
    var dueDate: String?
    var snoozedUntil: String?
    var completedAt: String?
    var canceledAt: String?
    var createdAt: String?
    var updatedAt: String?
    var project: GtdProjectDTO?
    var attachments: [GtdAttachmentDTO]?
}

struct BootstrapResponse: Codable {
    var identity: GtdIdentityDTO
    var projects: [GtdProjectDTO]
    var currentTask: GtdTaskDTO?
    var counts: Counts
    var nextWakeAt: String?

    struct Counts: Codable {
        var available: Int
        var active: Int
    }
}

struct TaskListResponse: Codable {
    var tasks: [GtdTaskDTO]
    var nextCursor: String?
}

struct ProjectListResponse: Codable {
    var projects: [GtdProjectDTO]
}

struct ArchiveResponse: Codable {
    var tasks: [GtdTaskDTO]
    var nextCursor: String?
}

struct TaskDetailsResponse: Codable {
    var id: String
    var content: String
    var status: String
    var orderKey: String
    var dueDate: String?
    var snoozedUntil: String?
    var completedAt: String?
    var canceledAt: String?
    var createdAt: String?
    var updatedAt: String?
    var project: GtdProjectDTO?
    var attachments: [GtdAttachmentDTO]?
    var events: [TaskEventDTO]
    var stats: Stats

    struct TaskEventDTO: Codable, Identifiable {
        var id: String
        var type: String
        var createdAt: String
    }

    struct Stats: Codable {
        var snoozed: Int
        var rotated: Int
    }
}

enum GtdAction: String, CaseIterable, Identifiable {
    case rotate = "ROTATE"
    case complete = "COMPLETE"
    case cancel = "CANCEL"
    case snoozeHour = "SNOOZE_HOUR"
    case snoozeHours2 = "SNOOZE_HOURS_2"
    case snoozeHours4 = "SNOOZE_HOURS_4"
    case snoozeEvening = "SNOOZE_EVENING"
    case snoozeTomorrow = "SNOOZE_TOMORROW"
    case snoozeDays2 = "SNOOZE_DAYS_2"
    case snoozeDays7 = "SNOOZE_DAYS_7"
    case snoozeDays14 = "SNOOZE_DAYS_14"
    case snoozeDays30 = "SNOOZE_DAYS_30"
    case snoozeMonday = "SNOOZE_MONDAY"
    case snoozeTuesday = "SNOOZE_TUESDAY"
    case snoozeWednesday = "SNOOZE_WEDNESDAY"
    case snoozeThursday = "SNOOZE_THURSDAY"
    case snoozeFriday = "SNOOZE_FRIDAY"
    case snoozeSaturday = "SNOOZE_SATURDAY"
    case snoozeSunday = "SNOOZE_SUNDAY"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .rotate: return "Rotate"
        case .complete: return "Complete"
        case .cancel: return "Cancel"
        case .snoozeHour: return "1 hour"
        case .snoozeHours2: return "2 hours"
        case .snoozeHours4: return "4 hours"
        case .snoozeEvening: return "Evening"
        case .snoozeTomorrow: return "Tomorrow"
        case .snoozeDays2: return "2 days"
        case .snoozeDays7: return "1 week"
        case .snoozeDays14: return "2 weeks"
        case .snoozeDays30: return "30 days"
        case .snoozeMonday: return "Monday"
        case .snoozeTuesday: return "Tuesday"
        case .snoozeWednesday: return "Wednesday"
        case .snoozeThursday: return "Thursday"
        case .snoozeFriday: return "Friday"
        case .snoozeSaturday: return "Saturday"
        case .snoozeSunday: return "Sunday"
        }
    }

    static let snoozePresets: [GtdAction] = [
        .snoozeHour, .snoozeHours2, .snoozeHours4, .snoozeEvening,
        .snoozeTomorrow, .snoozeDays2, .snoozeDays7, .snoozeDays14, .snoozeDays30,
        .snoozeMonday, .snoozeTuesday, .snoozeWednesday, .snoozeThursday,
        .snoozeFriday, .snoozeSaturday, .snoozeSunday,
    ]
}
