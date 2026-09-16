import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage("appearance") private var appearance = AppAppearance.system.rawValue

    var body: some View {
        Group {
            if model.isAuthenticated {
                ControlView()
            } else {
                LoginView()
            }
        }
        .preferredColorScheme(AppAppearance(rawValue: appearance)?.colorScheme)
    }
}

enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var title: String { switch self { case .system: "跟随系统"; case .light: "浅色"; case .dark: "深色" } }
    var colorScheme: ColorScheme? { switch self { case .system: nil; case .light: .light; case .dark: .dark } }
}

private struct LoginView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            Form {
                Section("连接") {
                    LabeledContent("后端", value: "Tailscale 优先·公网回退")
                    SecureField("访问密码", text: $model.password)
                    Toggle("保持登录", isOn: $model.keepSignedIn)
                }
                Section("高级") {
                    TextField("自定义后端 URL（可选）", text: $model.serverAddress)
                        .textInputAutocapitalization(.never).keyboardType(.URL).autocorrectionDisabled()
                }
                if let error = model.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                Button {
                    Feedback.tap()
                    Task { await model.login() }
                } label: {
                    HStack {
                        Spacer()
                        if model.isBusy { ProgressView() } else { Text("连接电脑") }
                        Spacer()
                    }
                }
                .disabled(model.isBusy || model.password.isEmpty)
            }
            .navigationTitle("Remote Input")
        }
    }
}
