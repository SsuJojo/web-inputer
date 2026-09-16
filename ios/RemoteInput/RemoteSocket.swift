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
    @Published private(set) var operationMessage: String?

    private var task: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var handshakeTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var eventID = 0
    private var baseURL: URL?
    private var intentionallyDisconnected = false
    @Published private(set) var heldKeys = Set<String>()

    func connect(baseURL: URL) {
        disconnect(clearBaseURL: false)
        self.baseURL = baseURL
        intentionallyDisconnected = false
        startConnection(baseURL: baseURL)
    }

    func ensureConnected() {
        guard task == nil, let baseURL else { return }
        reconnectTask?.cancel()
        reconnectTask = nil
        intentionallyDisconnected = false
        startConnection(baseURL: baseURL)
    }

    private func startConnection(baseURL: URL) {
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
        startReceiving(webSocketTask)
        handshakeTask?.cancel()
        handshakeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(10))
            guard !Task.isCancelled, let self, self.state != .connected else { return }
            self.connectionDidFail(task: webSocketTask, message: "连接超时，正在重试")
        }
    }

    func disconnect() {
        disconnect(clearBaseURL: true)
    }

    private func disconnect(clearBaseURL: Bool) {
        intentionallyDisconnected = true
        reconnectTask?.cancel()
        reconnectTask = nil
        releaseHeldKeys()
        receiveTask?.cancel()
        heartbeatTask?.cancel()
        handshakeTask?.cancel()
        receiveTask = nil
        heartbeatTask = nil
        handshakeTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        if clearBaseURL { baseURL = nil }
        latency = nil
        state = .disconnected
    }

    @discardableResult
    func tap(_ key: String) -> Bool {
        sendInput(action: "tap", fields: ["key": key])
    }

    @discardableResult
    func keyDown(_ key: String) -> Bool {
        guard !heldKeys.contains(key), sendInput(action: "down", fields: ["key": key]) else { return false }
        heldKeys.insert(key)
        return true
    }

    @discardableResult
    func keyUp(_ key: String) -> Bool {
        guard heldKeys.contains(key), sendInput(action: "up", fields: ["key": key]) else { return false }
        heldKeys.remove(key)
        return true
    }

    func sendCombo(modifiers: [String], key: String) {
        let pressedByCombo = modifiers.filter { !heldKeys.contains($0) }
        for modifier in pressedByCombo { keyDown(modifier) }
        tap(key)
        for modifier in pressedByCombo.reversed() { keyUp(modifier) }
    }

    @discardableResult
    func sendInput(action: String, fields: [String: Any] = [:]) -> Bool {
        guard state == .connected else { return false }
        eventID += 1
        var payload: [String: Any] = [
            "type": "input",
            "id": eventID,
            "clientTs": Int(Date().timeIntervalSince1970 * 1000),
            "action": action
        ]
        payload.merge(fields) { _, new in new }
        return rawSend(payload)
    }

    func sendWindow(action: String, direction: String? = nil) {
        guard state == .connected else { return }
        eventID += 1
        var payload: [String: Any] = ["type": "window", "id": eventID, "action": action]
        if let direction { payload["direction"] = direction }
        rawSend(payload)
    }

    @discardableResult
    private func rawSend(_ payload: [String: Any]) -> Bool {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8),
              let task else { return false }
        task.send(.string(text)) { [weak self] error in
            guard let error else { return }
            Task { @MainActor in self?.connectionDidFail(task: task, message: error.localizedDescription) }
        }
        return true
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
                    self?.connectionDidFail(task: webSocketTask, message: "连接已断开")
                    return
                }
            }
        }
    }

    private func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard let self, !Task.isCancelled else { return }
                self.rawSend(["type": "ping", "ts": Int(Date().timeIntervalSince1970 * 1000)])
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
        if type == "hello" {
            state = .connecting
            rawSend(["type": "claim"])
            rawSend(["type": "ping", "ts": Int(Date().timeIntervalSince1970 * 1000)])
            startHeartbeat()
        } else if type == "pong", let timestamp = value["ts"] as? NSNumber {
            latency = max(0, Int(Date().timeIntervalSince1970 * 1000) - timestamp.intValue)
        } else if type == "control" {
            if value["ok"] as? Bool == true {
                handshakeTask?.cancel()
                handshakeTask = nil
                state = .connected
                operationMessage = nil
                sendWindow(action: "state")
            } else {
                operationMessage = value["reason"] as? String ?? "控制权被占用"
                state = .failed(operationMessage ?? "控制权被占用")
            }
        } else if type == "window_state",
                  let current = value["current"] as? [String: Any] {
            currentWindowTitle = current["title"] as? String ?? ""
        } else if type == "error" || type == "window_error" {
            operationMessage = value["message"] as? String ?? "操作失败"
        }
    }

    func releaseHeldKeys() {
        for key in heldKeys {
            eventID += 1
            rawSend(["type": "input", "id": eventID, "clientTs": Int(Date().timeIntervalSince1970 * 1000), "action": "up", "key": key])
        }
        heldKeys.removeAll()
    }

    private func connectionDidFail(task failedTask: URLSessionWebSocketTask, message: String) {
        guard task === failedTask else { return }
        heartbeatTask?.cancel()
        handshakeTask?.cancel()
        heartbeatTask = nil
        handshakeTask = nil
        failedTask.cancel(with: .goingAway, reason: nil)
        task = nil
        heldKeys.removeAll()
        state = .failed(message)
        scheduleReconnect()
    }

    private func scheduleReconnect() {
        guard !intentionallyDisconnected, reconnectTask == nil, baseURL != nil else { return }
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1.2))
            guard !Task.isCancelled, let self, let baseURL = self.baseURL else { return }
            self.reconnectTask = nil
            guard self.task == nil else { return }
            self.startConnection(baseURL: baseURL)
        }
    }
}
