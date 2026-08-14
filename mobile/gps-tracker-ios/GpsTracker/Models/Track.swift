import Foundation
import SwiftData

@Model
final class Track {
    @Attribute(.unique) var id: String
    var name: String
    var startedAt: Date
    var endedAt: Date?
    /// recording | paused | finished
    var status: String
    var gpxFileName: String
    var distanceM: Double
    var pointCount: Int

    init(
        id: String = UUID().uuidString,
        name: String,
        startedAt: Date = .now,
        endedAt: Date? = nil,
        status: String = "recording",
        gpxFileName: String,
        distanceM: Double = 0,
        pointCount: Int = 0
    ) {
        self.id = id
        self.name = name
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.status = status
        self.gpxFileName = gpxFileName
        self.distanceM = distanceM
        self.pointCount = pointCount
    }

    var isActive: Bool {
        status == "recording" || status == "paused"
    }

    var duration: TimeInterval {
        let end = endedAt ?? Date()
        return end.timeIntervalSince(startedAt)
    }
}
