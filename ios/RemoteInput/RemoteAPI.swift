import Foundation

struct RemoteAPI {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func login(baseURL: URL, password: String, keepSignedIn: Bool) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(LoginRequest(password: password, keepSignedIn: keepSignedIn))
        let (_, response) = try await session.data(for: request)
        try validate(response)
        storeResponseCookies(response, for: baseURL)
    }

    func logout(baseURL: URL) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/logout"))
        request.httpMethod = "POST"
        let (_, response) = try await session.data(for: request)
        try validate(response)
    }

    func hasSession(baseURL: URL) async throws -> Bool {
        let request = authenticatedRequest(url: baseURL.appending(path: "api/session"))
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { return false }
        try validate(response)
        return true
    }

    func powerStatus(baseURL: URL) async throws -> PowerStatus {
        let request = authenticatedRequest(url: baseURL.appending(path: "api/power/status"))
        let (data, response) = try await session.data(for: request)
        try validate(response)
        return try JSONDecoder().decode(PowerStatus.self, from: data)
    }

    func performPowerAction(baseURL: URL, action: PowerAction, delaySeconds: Double) async throws -> PowerStatus {
        var request = authenticatedRequest(url: baseURL.appending(path: "api/power/\(action.rawValue)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "action": action.rawValue,
            "confirm": true,
            "delaySeconds": delaySeconds
        ])
        let (data, response) = try await session.data(for: request)
        try validate(response)
        return try JSONDecoder().decode(PowerStatus.self, from: data)
    }

    func cancelPowerSchedule(baseURL: URL) async throws {
        var request = authenticatedRequest(url: baseURL.appending(path: "api/power/cancel"))
        request.httpMethod = "POST"
        let (_, response) = try await session.data(for: request)
        try validate(response)
    }

    func screenFrame(baseURL: URL) async throws -> Data {
        var components = URLComponents(url: baseURL.appending(path: "api/screen/frame"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "t", value: String(Int(Date().timeIntervalSince1970 * 1000)))]
        guard let url = components?.url else { throw APIError.invalidResponse }
        var request = authenticatedRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = 12
        let (data, response) = try await session.data(for: request)
        try validate(response)
        guard !data.isEmpty else { throw APIError.invalidResponse }
        return data
    }

    private func authenticatedRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        if let cookies = HTTPCookieStorage.shared.cookies(for: url), !cookies.isEmpty {
            request.setValue(HTTPCookie.requestHeaderFields(with: cookies)["Cookie"], forHTTPHeaderField: "Cookie")
        }
        return request
    }

    private func storeResponseCookies(_ response: URLResponse, for url: URL) {
        guard let http = response as? HTTPURLResponse,
              let header = http.value(forHTTPHeaderField: "Set-Cookie") else { return }
        let fields = ["Set-Cookie": header]
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) {
            HTTPCookieStorage.shared.setCookie(cookie)
        }
    }

    private func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.httpStatus(http.statusCode) }
    }
}

private struct LoginRequest: Encodable {
    let password: String
    let keepSignedIn: Bool
}

enum APIError: LocalizedError {
    case invalidResponse
    case httpStatus(Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "服务器响应无效"
        case .httpStatus(401): "密码错误"
        case .httpStatus(429): "尝试次数过多，请稍后再试"
        case let .httpStatus(code): "请求失败（HTTP \(code)）"
        }
    }
}
