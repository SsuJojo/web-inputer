import Foundation

@MainActor
final class RemoteSocket: ObservableObject {
    enum State: Equatable {
        case disconnected
        case connecting
        case connected
        case failed(String)

        var label: String {
            switch self {
            case .disconnected: "未连接"
            case .connecting: "连接中"
            case .connected: "已连接"
            case let .failed(message): message
            }
        }
    }

    @Published private(set) var state: State = .disconnected
    @Published private(set) var latency: Int?
    @Published private(set) var currentWindowTitle = ""

    private var task: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var eventID = 0

    func connect(baseURL: URL) {
        disconnect()
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return }
        components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components.path = "/ws"
        guard let url = components.url else { return }

        var request = URLRequest(url: url)
        request.setValue(baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
        if let cookies = HTTPCookieStorage.shared.cookies(for: baseURL), !cookies.isEmpty {
            request.setValue(HTTPCookie.requestHeaderFields(with: cookies)["Cookie"], forHTTPHeaderField: "Cookie")
        }
        state = .connecting
        let webSocketTask = URLSession.shared.webSocketTask(with: request)
        task = webSocketTask
        webSocketTask.resume()
        state = .connected
        send(["type": "claim"])
        sendWindow(action: "state")
        startReceiving(webSocketTask)
        startHeartbeat()
    }

    func disconnect() {
        receiveTask?.cancel()
        heartbeatTask?.cancel()
        receiveTask = nil
        heartbeatTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        latency = nil
        state = .disconnected
    }

    func tap(_ key: String) {
        sendInput(action: "tap", fields: ["key": key])
    }

    func sendCombo(modifiers: [String], key: String) {
        for modifier in modifiers { sendInput(action: "down", fields: ["key": modifier]) }
        tap(key)
        for modifier in modifiers.reversed() { sendInput(action: "up", fields: ["key": modifier]) }
    }

    func sendInput(action: String, fields: [String: Any] = [:]) {
        eventID += 1
        var payload: [String: Any] = [
            "type": "input",
            "id": eventID,
            "clientTs": Int(Date().timeIntervalSince1970 * 1000),
            "action": action
        ]
        payload.merge(fields) { _, new in new }
        send(payload)
    }

    func sendWindow(action: String, direction: String? = nil) {
        eventID += 1
        var payload: [String: Any] = ["type": "window", "id": eventID, "action": action]
        if let direction { payload["direction"] = direction }
        send(payload)
    }

    private func send(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(text)) { [weak self] error in
            guard let error else { return }
            Task { @MainActor in self?.state = .failed(error.localizedDescription) }
        }
    }

    private func startReceiving(_ webSocketTask: URLSessionWebSocketTask) {
        receiveTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    let message = try await webSocketTask.receive()
                    guard let self else { return }
                    self.handle(message)
                } catch {
                    guard !Task.isCancelled else { return }
                    self?.state = .failed("连接已断开")
                    return
                }
            }
        }
    }

    private func startHeartbeat() {
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard let self, !Task.isCancelled else { return }
                self.send(["type": "ping", "ts": Int(Date().timeIntervalSince1970 * 1000)])
            }
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let data: Data?
        switch message {
        case let .string(text): data = text.data(using: .utf8)
        case let .data(value): data = value
        @unknown default: data = nil
        }
        guard let data,
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = value["type"] as? String else { return }
        if type == "pong", let timestamp = value["ts"] as? NSNumber {
            latency = max(0, Int(Date().timeIntervalSince1970 * 1000) - timestamp.intValue)
        } else if type == "window_state",
                  let current = value["current"] as? [String: Any] {
            currentWindowTitle = current["title"] as? String ?? ""
        } else if type == "error" || type == "window_error" {
            state = .failed(value["message"] as? String ?? "操作失败")
        }
    }
}
