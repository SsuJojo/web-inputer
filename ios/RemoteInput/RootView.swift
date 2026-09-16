import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.isAuthenticated {
                ControlView()
            } else {
                LoginView()
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct LoginView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            Form {
                Section("服务器") {
                    TextField("https://remote.example.com", text: $model.serverAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    SecureField("访问密码", text: $model.password)
                    Toggle("保持登录", isOn: $model.keepSignedIn)
                }
                if let error = model.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                Button {
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

