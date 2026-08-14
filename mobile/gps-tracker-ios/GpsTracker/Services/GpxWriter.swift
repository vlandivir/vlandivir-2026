import CoreLocation
import Foundation

enum GpxWriter {
    static let creator = "vlandivir-gps-tracker"

    static func tracksDirectory() throws -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let dir = docs.appendingPathComponent("tracks", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func fileURL(fileName: String) throws -> URL {
        try tracksDirectory().appendingPathComponent(fileName)
    }

    static func write(
        fileName: String,
        name: String,
        startedAt: Date,
        segments: [[CLLocation]]
    ) throws {
        let url = try fileURL(fileName: fileName)
        let xml = buildXML(name: name, startedAt: startedAt, segments: segments)
        try xml.write(to: url, atomically: true, encoding: .utf8)
    }

    static func buildXML(name: String, startedAt: Date, segments: [[CLLocation]]) -> String {
        var out = ""
        out += #"<?xml version="1.0" encoding="UTF-8"?>"#
        out += "\n"
        out += #"<gpx version="1.1" creator="\#(creator)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">"#
        out += "\n"
        out += "  <metadata>\n"
        out += "    <name>\(escape(name))</name>\n"
        out += "    <time>\(iso(startedAt))</time>\n"
        out += "  </metadata>\n"
        out += "  <trk>\n"
        out += "    <name>\(escape(name))</name>\n"
        for segment in segments where !segment.isEmpty {
            out += "    <trkseg>\n"
            for loc in segment {
                out += "      <trkpt lat=\"\(fmt(loc.coordinate.latitude))\" lon=\"\(fmt(loc.coordinate.longitude))\">\n"
                if loc.verticalAccuracy >= 0 {
                    out += "        <ele>\(fmt(loc.altitude))</ele>\n"
                }
                out += "        <time>\(iso(loc.timestamp))</time>\n"
                out += "      </trkpt>\n"
            }
            out += "    </trkseg>\n"
        }
        out += "  </trk>\n"
        out += "</gpx>\n"
        return out
    }

    static func parseCoordinates(from fileURL: URL) -> [CLLocationCoordinate2D] {
        parseLocations(from: fileURL).map(\.coordinate)
    }

    /// Best-effort GPX point parse (lat/lon/ele/time) for post-process smoothing.
    static func parseLocations(from fileURL: URL) -> [CLLocation] {
        guard let xml = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
        let pattern =
            #"<trkpt\s+lat="([-0-9.]+)"\s+lon="([-0-9.]+)"\s*>\s*(?:<ele>([-0-9.]+)</ele>\s*)?(?:<time>([^<]+)</time>\s*)?"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators])
        else { return [] }

        var locations: [CLLocation] = []
        let range = NSRange(xml.startIndex..<xml.endIndex, in: xml)
        regex.enumerateMatches(in: xml, range: range) { match, _, _ in
            guard
                let match,
                let latRange = Range(match.range(at: 1), in: xml),
                let lonRange = Range(match.range(at: 2), in: xml),
                let lat = Double(xml[latRange]),
                let lon = Double(xml[lonRange])
            else { return }

            var altitude = 0.0
            var verticalAccuracy: CLLocationAccuracy = -1
            if match.range(at: 3).location != NSNotFound,
               let eleRange = Range(match.range(at: 3), in: xml),
               let ele = Double(xml[eleRange])
            {
                altitude = ele
                verticalAccuracy = 10
            }

            var timestamp = Date()
            if match.range(at: 4).location != NSNotFound,
               let timeRange = Range(match.range(at: 4), in: xml)
            {
                timestamp = isoFormatter.date(from: String(xml[timeRange])) ?? timestamp
            }

            locations.append(
                CLLocation(
                    coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                    altitude: altitude,
                    horizontalAccuracy: 10,
                    verticalAccuracy: verticalAccuracy,
                    timestamp: timestamp
                )
            )
        }
        return locations
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static func iso(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }

    private static func fmt(_ value: Double) -> String {
        String(format: "%.7f", value)
    }

    private static func escape(_ text: String) -> String {
        text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }
}
