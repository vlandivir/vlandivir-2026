import Foundation

enum APIError: LocalizedError {
    case unauthorized
    case http(Int, String)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Signed out — please sign in again"
        case .http(let code, let body):
            return "Server error \(code): \(body)"
        case .decoding(let error):
            return "Bad response: \(error.localizedDescription)"
        case .transport(let error):
            return error.localizedDescription
        }
    }
}

actor APIClient {
    private let baseURL: URL
    private var tokenProvider: @Sendable () -> String?

    init(
        baseURL: URL = APIConfig.baseURL,
        tokenProvider: @escaping @Sendable () -> String? = { KeychainStore.readToken() }
    ) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
    }

    func setTokenProvider(_ provider: @escaping @Sendable () -> String?) {
        tokenProvider = provider
    }

    func bootstrap(scope: GtdScope) async throws -> BootstrapResponse {
        var items = [URLQueryItem(name: "scope", value: scope.kind.rawValue)]
        if scope.kind == .project, let projectId = scope.projectId {
            items.append(URLQueryItem(name: "projectId", value: projectId))
        }
        return try await get("gtd-api/bootstrap", query: items)
    }

    func listTasks(
        status: String = "ACTIVE",
        updatedSince: String? = nil,
        cursor: String? = nil,
        limit: Int = 100
    ) async throws -> TaskListResponse {
        var items = [
            URLQueryItem(name: "status", value: status),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        if let updatedSince {
            items.append(URLQueryItem(name: "updatedSince", value: updatedSince))
        }
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await get("gtd-api/tasks", query: items)
    }

    func listProjects(updatedSince: String? = nil) async throws -> ProjectListResponse {
        var items: [URLQueryItem] = []
        if let updatedSince {
            items.append(URLQueryItem(name: "updatedSince", value: updatedSince))
        }
        return try await get("gtd-api/projects", query: items)
    }

    func createTask(content: String, projectId: String?, dueDate: String?) async throws -> GtdTaskDTO {
        var body: [String: Any] = ["content": content]
        if let projectId { body["projectId"] = projectId }
        if let dueDate { body["dueDate"] = dueDate }
        return try await send("gtd-api/tasks", method: "POST", json: body)
    }

    func updateTask(
        id: String,
        content: String?,
        projectId: String??,
        dueDate: String??
    ) async throws -> GtdTaskDTO {
        var body: [String: Any] = [:]
        if let content { body["content"] = content }
        if let projectId {
            body["projectId"] = projectId as Any
        }
        if let dueDate {
            body["dueDate"] = dueDate as Any
        }
        return try await send("gtd-api/tasks/\(id)", method: "PATCH", json: body)
    }

    func act(taskId: String, action: GtdAction) async throws -> GtdTaskDTO {
        try await send(
            "gtd-api/tasks/\(taskId)/actions",
            method: "POST",
            json: ["action": action.rawValue]
        )
    }

    func createProject(name: String) async throws -> GtdProjectDTO {
        try await send("gtd-api/projects", method: "POST", json: ["name": name])
    }

    func updateProject(id: String, name: String?, archived: Bool?) async throws -> GtdProjectDTO {
        var body: [String: Any] = [:]
        if let name { body["name"] = name }
        if let archived { body["archived"] = archived }
        return try await send("gtd-api/projects/\(id)", method: "PATCH", json: body)
    }

    func archive(cursor: String? = nil, status: String? = nil) async throws -> ArchiveResponse {
        var items: [URLQueryItem] = []
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let status { items.append(URLQueryItem(name: "status", value: status)) }
        return try await get("gtd-api/archive", query: items)
    }

    func taskDetails(id: String) async throws -> TaskDetailsResponse {
        try await get("gtd-api/tasks/\(id)")
    }

    func downloadAttachment(id: String) async throws -> Data {
        if let cached = attachmentCache[id] {
            return cached
        }
        let data = try await rawData("gtd-api/attachments/\(id)", method: "GET")
        attachmentCache[id] = data
        return data
    }

    // MARK: - HTTP

    private var attachmentCache: [String: Data] = [:]

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await send(path, method: "GET", query: query, json: nil)
    }

    private func send<T: Decodable>(
        _ path: String,
        method: String,
        query: [URLQueryItem] = [],
        json: [String: Any]?
    ) async throws -> T {
        let data = try await rawData(path, method: method, query: query, json: json)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func rawData(
        _ path: String,
        method: String,
        query: [URLQueryItem] = [],
        json: [String: Any]? = nil
    ) async throws -> Data {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty {
            components.queryItems = query
        }
        guard let url = components.url else {
            throw APIError.http(0, "Bad URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.http(0, "No HTTP response")
        }
        if http.statusCode == 401 {
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.http(http.statusCode, body)
        }
        return data
    }
}
