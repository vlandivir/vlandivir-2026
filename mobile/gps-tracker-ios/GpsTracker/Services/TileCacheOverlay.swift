import Foundation
import MapKit

final class CachedTileOverlay: MKTileOverlay {
    private let cacheRoot: URL
    private let session: URLSession
    private let userAgent =
        "vlandivir-gps-tracker/1.0 (personal; https://vlandivir.com; contact via site)"

    init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheRoot = caches.appendingPathComponent("osm-tiles", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheRoot, withIntermediateDirectories: true)

        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        config.httpAdditionalHeaders = ["User-Agent": userAgent]
        session = URLSession(configuration: config)

        super.init(urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
        canReplaceMapContent = true
        maximumZ = 19
    }

    override func url(forTilePath path: MKTileOverlayPath) -> URL {
        URL(string: "https://tile.openstreetmap.org/\(path.z)/\(path.x)/\(path.y).png")!
    }

    override func loadTile(
        at path: MKTileOverlayPath,
        result: @escaping (Data?, (any Error)?) -> Void
    ) {
        let fileURL = diskURL(for: path)
        if let data = try? Data(contentsOf: fileURL) {
            result(data, nil)
            return
        }

        let remote = url(forTilePath: path)
        var request = URLRequest(url: remote)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")

        session.dataTask(with: request) { [weak self] data, response, error in
            if let error {
                result(nil, error)
                return
            }
            guard
                let data,
                let http = response as? HTTPURLResponse,
                (200..<300).contains(http.statusCode)
            else {
                result(nil, URLError(.badServerResponse))
                return
            }
            self?.persist(data, at: fileURL)
            result(data, nil)
        }.resume()
    }

    private func diskURL(for path: MKTileOverlayPath) -> URL {
        cacheRoot
            .appendingPathComponent("\(path.z)", isDirectory: true)
            .appendingPathComponent("\(path.x)", isDirectory: true)
            .appendingPathComponent("\(path.y).png")
    }

    private func persist(_ data: Data, at fileURL: URL) {
        let dir = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: fileURL, options: .atomic)
    }
}
