import Foundation
import UIKit

@MainActor
final class AppModel: ObservableObject {
    @Published var serverAddress: String
    @Published var password = ""
    @Published var keepSignedIn = true
    @Published var isAuthenticated = false
    @Published var isBusy = false
    @Published var errorMessage: String?
    @Published var inputText = ""
    @Published var previewEnabled = true
    @Published var previewImage: UIImage?
    @Published var previewLoading = false
    @Published var previewError: String?
    @Published var powerStatus: PowerStatus?
    @Published var powerLoading = false
    @Published var powerError: String?
    @Published var selectedPowerAction: PowerAction?
    @Published var powerScheduleMode: PowerScheduleMode = .now
    @Published var powerDelayMinutes = 10
    @Published var powerScheduledTime = Date().addingTimeInterval(3600)
    @Published var powerConfirmation = 0.0

    let socket = RemoteSocket()
    private let api = RemoteAPI()
    private let defaults: UserDefaults
    private var previewTask: Task<Void, Never>?
    private var powerRefreshTask: Task<Void, Never>?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        serverAddress = defaults.string(forKey: "serverAddress") ?? "https://"
#if DEBUG
        let environment = ProcessInfo.processInfo.environment
        if let server = environment["REMOTE_INPUT_SERVER"],
           let launchPassword = environment["REMOTE_INPUT_PASSWORD"] {
            serverAddress = server
            password = launchPassword
            Task { await login() }
            return
        }
#endif
        if defaults.string(forKey: "serverAddress") != nil {
            Task { await restoreSession() }
        }
    }

    var baseURL: URL? {
        ServerAddress.normalized(serverAddress)
    }

    func login() async {
        guard let baseURL else {
            errorMessage = "请输入有效的服务器地址"
            return
        }
        isBusy = true
        errorMessage = nil
        do {
            try await api.login(baseURL: baseURL, password: password, keepSignedIn: keepSignedIn)
            defaults.set(baseURL.absoluteString, forKey: "serverAddress")
            serverAddress = baseURL.absoluteString
            password = ""
            isAuthenticated = true
            socket.connect(baseURL: baseURL)
            startPreview()
            await refreshPowerStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
        isBusy = false
    }

    func restoreSession() async {
        guard let baseURL else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            guard try await api.hasSession(baseURL: baseURL) else { return }
            isAuthenticated = true
            socket.connect(baseURL: baseURL)
            startPreview()
            await refreshPowerStatus()
        } catch {
            return
        }
    }

    func logout() async {
        if let baseURL {
            try? await api.logout(baseURL: baseURL)
        }
        socket.disconnect()
        stopPreview()
        powerRefreshTask?.cancel()
        isAuthenticated = false
    }

    func sendText() {
        guard !inputText.isEmpty else { return }
        socket.sendInput(action: "text", fields: ["text": inputText])
        inputText = ""
    }

    func syncClipboard() {
        socket.sendInput(action: "clipboard_set", fields: ["text": inputText])
    }

    func setPreviewEnabled(_ enabled: Bool) {
        previewEnabled = enabled
        enabled ? startPreview() : stopPreview()
    }

    func startPreview() {
        guard previewEnabled, previewTask == nil, let baseURL else { return }
        previewLoading = previewImage == nil
        previewError = nil
        previewTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    let data = try await self?.api.screenFrame(baseURL: baseURL)
                    guard let data, let image = UIImage(data: data) else { throw APIError.invalidResponse }
                    guard !Task.isCancelled else { return }
                    self?.previewImage = image
                    self?.previewLoading = false
                    self?.previewError = nil
                    try? await Task.sleep(for: .milliseconds(650))
                } catch {
                    guard !Task.isCancelled else { return }
                    self?.previewLoading = false
                    self?.previewError = error.localizedDescription
                    try? await Task.sleep(for: .seconds(2))
                }
            }
        }
    }

    func stopPreview() {
        previewTask?.cancel()
        previewTask = nil
        previewLoading = false
    }

    func retryPreview() {
        stopPreview()
        startPreview()
    }

    func refreshPowerStatus() async {
        guard let baseURL else { return }
        powerLoading = true
        defer { powerLoading = false }
        do {
            powerStatus = try await api.powerStatus(baseURL: baseURL)
            powerError = nil
            schedulePowerRefresh()
        } catch {
            powerError = error.localizedDescription
        }
    }

    func openPowerConfirmation(_ action: PowerAction) {
        selectedPowerAction = action
        powerScheduleMode = .now
        powerConfirmation = 0
    }

    func performSelectedPowerAction() async -> Bool {
        guard let baseURL, let action = selectedPowerAction, powerConfirmation >= 0.92 else { return false }
        powerLoading = true
        defer { powerLoading = false }
        do {
            let delay = powerDelaySeconds()
            powerStatus = try await api.performPowerAction(baseURL: baseURL, action: action, delaySeconds: delay)
            powerError = nil
            selectedPowerAction = nil
            schedulePowerRefresh()
            return true
        } catch {
            powerError = error.localizedDescription
            return false
        }
    }

    func cancelPowerSchedule() async {
        guard let baseURL else { return }
        powerLoading = true
        defer { powerLoading = false }
        do {
            try await api.cancelPowerSchedule(baseURL: baseURL)
            powerStatus = try await api.powerStatus(baseURL: baseURL)
            powerError = nil
        } catch {
            powerError = error.localizedDescription
        }
    }

    func powerRemainingText(now: Date = Date()) -> String? {
        guard let scheduled = powerStatus?.scheduled else { return nil }
        let seconds = max(0, Int(scheduled.dueAt - now.timeIntervalSince1970))
        if seconds < 60 { return "\(seconds) 秒后" }
        return "\(seconds / 60) 分 \(seconds % 60) 秒后"
    }

    private func powerDelaySeconds(now: Date = Date()) -> Double {
        switch powerScheduleMode {
        case .now: return 0
        case .countdown: return Double(max(1, powerDelayMinutes) * 60)
        case .time:
            let calendar = Calendar.current
            var target = calendar.date(bySettingHour: calendar.component(.hour, from: powerScheduledTime), minute: calendar.component(.minute, from: powerScheduledTime), second: 0, of: now) ?? now
            if target <= now { target = calendar.date(byAdding: .day, value: 1, to: target) ?? target }
            return max(1, target.timeIntervalSince(now))
        }
    }

    private func schedulePowerRefresh() {
        powerRefreshTask?.cancel()
        guard powerStatus?.scheduled != nil else { return }
        powerRefreshTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(20))
            guard !Task.isCancelled else { return }
            await self?.refreshPowerStatus()
        }
    }
}

enum ServerAddress {
    static func normalized(_ value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let candidate = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        guard var components = URLComponents(string: candidate),
              ["http", "https"].contains(components.scheme?.lowercased() ?? ""),
              components.host != nil else { return nil }
        components.path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard components.path.isEmpty else { return nil }
        return components.url
    }
}
