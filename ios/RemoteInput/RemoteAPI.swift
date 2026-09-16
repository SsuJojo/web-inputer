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
    }

    func logout(baseURL: URL) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/logout"))
        request.httpMethod = "POST"
        let (_, response) = try await session.data(for: request)
        try validate(response)
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

