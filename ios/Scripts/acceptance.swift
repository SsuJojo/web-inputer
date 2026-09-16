import Foundation

enum AcceptanceError: LocalizedError {
    case missingPassword
    case invalidServer
    case httpStatus(Int)
    case missingCookie
    case unexpectedMessage(String)

    var errorDescription: String? {
        switch self {
        case .missingPassword: "REMOTE_INPUT_PASSWORD is not set"
        case .invalidServer: "The server URL is invalid"
        case let .httpStatus(code): "Login failed with HTTP \(code)"
        case .missingCookie: "The login response did not create a session cookie"
        case let .unexpectedMessage(message): "Unexpected WebSocket message: \(message)"
        }
    }
}

@main
struct RemoteInputAcceptance {
    static func main() async throws {
        guard CommandLine.arguments.count == 2,
              let baseURL = URL(string: CommandLine.arguments[1]),
              ["http", "https"].contains(baseURL.scheme?.lowercased() ?? ""),
              baseURL.host != nil else { throw AcceptanceError.invalidServer }
        guard let password = ProcessInfo.processInfo.environment["REMOTE_INPUT_PASSWORD"],
              !password.isEmpty else { throw AcceptanceError.missingPassword }

        let cookieStorage = HTTPCookieStorage()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = cookieStorage
        configuration.httpShouldSetCookies = true
        let session = URLSession(configuration: configuration)

        var loginRequest = URLRequest(url: baseURL.appending(path: "api/login"))
        loginRequest.httpMethod = "POST"
        loginRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        loginRequest.httpBody = try JSONSerialization.data(withJSONObject: [
            "password": password,
            "keepSignedIn": false
        ])
        let (_, loginResponse) = try await session.data(for: loginRequest)
        guard let loginHTTP = loginResponse as? HTTPURLResponse else { throw AcceptanceError.httpStatus(0) }
        guard (200..<300).contains(loginHTTP.statusCode) else { throw AcceptanceError.httpStatus(loginHTTP.statusCode) }
        guard let setCookie = loginHTTP.value(forHTTPHeaderField: "Set-Cookie"),
              let cookieHeader = setCookie.split(separator: ";", maxSplits: 1).first,
              !cookieHeader.isEmpty else { throw AcceptanceError.missingCookie }
        print("LOGIN_OK")

        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw AcceptanceError.invalidServer
        }
        components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components.path = "/ws"
        guard let webSocketURL = components.url else { throw AcceptanceError.invalidServer }
        var webSocketRequest = URLRequest(url: webSocketURL)
        webSocketRequest.setValue(baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
        webSocketRequest.setValue(String(cookieHeader), forHTTPHeaderField: "Cookie")
        let webSocket = session.webSocketTask(with: webSocketRequest)
        webSocket.resume()
        defer { webSocket.cancel(with: .normalClosure, reason: nil) }

        _ = try await receive(webSocket, type: "hello")
        print("WEBSOCKET_OK")
        try await send(webSocket, ["type": "claim"])
        let control = try await receive(webSocket, type: "control")
        guard control["ok"] as? Bool == true else { throw AcceptanceError.unexpectedMessage(String(describing: control)) }
        print("CONTROL_OK")

        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        try await send(webSocket, ["type": "ping", "ts": timestamp])
        _ = try await receive(webSocket, type: "pong")
        print("PING_OK")

        try await send(webSocket, ["type": "window", "id": 1, "action": "state"])
        _ = try await receive(webSocket, anyOf: ["window_state", "window_error"])
        print("WINDOW_STATE_OK")

        try await send(webSocket, [
            "type": "input",
            "id": 2,
            "clientTs": Int(Date().timeIntervalSince1970 * 1000),
            "action": "mouse_move",
            "x": 0,
            "y": 0,
            "source": "acceptance"
        ])
        let acknowledgement = try await receive(webSocket, anyOf: ["ack", "error"])
        guard acknowledgement["type"] as? String == "ack" else {
            throw AcceptanceError.unexpectedMessage(String(describing: acknowledgement))
        }
        print("INPUT_ACK_OK")
        print("ACCEPTANCE_SUCCEEDED")
    }

    private static func send(_ webSocket: URLSessionWebSocketTask, _ object: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: object)
        guard let text = String(data: data, encoding: .utf8) else {
            throw AcceptanceError.unexpectedMessage("Unable to encode JSON")
        }
        try await webSocket.send(.string(text))
    }

    private static func receive(_ webSocket: URLSessionWebSocketTask, type: String) async throws -> [String: Any] {
        try await receive(webSocket, anyOf: [type])
    }

    private static func receive(_ webSocket: URLSessionWebSocketTask, anyOf types: Set<String>) async throws -> [String: Any] {
        for _ in 0..<20 {
            let message = try await webSocket.receive()
            let data: Data
            switch message {
            case let .string(text): data = Data(text.utf8)
            case let .data(value): data = value
            @unknown default: continue
            }
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = object["type"] as? String else { continue }
            if types.contains(type) { return object }
        }
        throw AcceptanceError.unexpectedMessage("Expected one of \(types.sorted())")
    }
}
