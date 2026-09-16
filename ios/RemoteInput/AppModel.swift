import Foundation

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

    let socket = RemoteSocket()
    private let api = RemoteAPI()
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        serverAddress = defaults.string(forKey: "serverAddress") ?? "https://"
    }

    var baseURL: URL? {
        ServerAddress.normalized(serverAddress)
    }

    var previewURL: URL? {
        guard previewEnabled else { return nil }
        return baseURL?.appending(path: "api/screen/frame")
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
        } catch {
            errorMessage = error.localizedDescription
        }
        isBusy = false
    }

    func logout() async {
        if let baseURL {
            try? await api.logout(baseURL: baseURL)
        }
        socket.disconnect()
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
