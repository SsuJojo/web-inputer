import SwiftUI

struct ControlView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    statusCard
                    previewCard
                    TextInputCard()
                    TouchpadCard()
                    KeyboardCard()
                }
                .padding()
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("遥控器")
            .toolbar {
                Button("设置", systemImage: "gearshape") { showingSettings = true }
            }
            .sheet(isPresented: $showingSettings) { SettingsView() }
        }
    }

    private var statusCard: some View {
        HStack {
            Circle()
                .fill(model.socket.state == .connected ? .green : .orange)
                .frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.socket.state.label).font(.headline)
                if !model.socket.currentWindowTitle.isEmpty {
                    Text(model.socket.currentWindowTitle).font(.caption).lineLimit(1)
                }
            }
            Spacer()
            Text(model.socket.latency.map { "\($0) ms" } ?? "-- ms")
                .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        }
        .cardStyle()
    }

    private var previewCard: some View {
        VStack(spacing: 10) {
            HStack {
                Text("屏幕预览").font(.headline)
                Spacer()
                Toggle("", isOn: $model.previewEnabled).labelsHidden()
            }
            if let url = model.previewURL {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    AsyncImage(url: frameURL(baseURL: url, date: context.date)) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFit()
                        } else if phase.error != nil {
                            ContentUnavailableView("无法载入预览", systemImage: "display.trianglebadge.exclamationmark")
                        } else {
                            ProgressView().frame(height: 160)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .cardStyle()
    }

    private func frameURL(baseURL: URL, date: Date) -> URL {
        baseURL.appending(queryItems: [URLQueryItem(name: "t", value: String(Int(date.timeIntervalSince1970)))])
    }
}

private struct TextInputCard: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("文字输入").font(.headline)
            TextField("输入文字", text: $model.inputText, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(2...5)
                .onSubmit { model.sendText() }
            HStack {
                Button("同步剪贴板", systemImage: "clipboard") { model.syncClipboard() }
                Spacer()
                Button("发送", systemImage: "paperplane.fill") { model.sendText() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .cardStyle()
    }
}

private struct TouchpadCard: View {
    @EnvironmentObject private var model: AppModel
    @State private var lastTranslation: CGSize = .zero

    var body: some View {
        VStack(spacing: 12) {
            Text("触控板").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
            RoundedRectangle(cornerRadius: 16)
                .fill(.quaternary)
                .frame(height: 190)
                .overlay(Image(systemName: "hand.draw").font(.largeTitle).foregroundStyle(.secondary))
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let dx = Int(value.translation.width - lastTranslation.width)
                        let dy = Int(value.translation.height - lastTranslation.height)
                        lastTranslation = value.translation
                        if dx != 0 || dy != 0 { model.socket.sendInput(action: "mouse_move", fields: ["x": dx, "y": dy]) }
                    }
                    .onEnded { value in
                        if abs(value.translation.width) < 4, abs(value.translation.height) < 4 {
                            model.socket.sendInput(action: "mouse_click", fields: ["button": "left"])
                        }
                        lastTranslation = .zero
                    })
            HStack {
                Button("左键") { model.socket.sendInput(action: "mouse_click", fields: ["button": "left"]) }
                Spacer()
                Button("右键") { model.socket.sendInput(action: "mouse_click", fields: ["button": "right"]) }
            }
            .buttonStyle(.bordered)
        }
        .cardStyle()
    }
}

private struct KeyboardCard: View {
    @EnvironmentObject private var model: AppModel
    private let rows = [["esc", "tab", "backspace"], ["ctrl", "alt", "shift", "win"], ["left", "up", "down", "right"]]

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text("快捷键").font(.headline)
                Spacer()
                Button("切换窗口") { model.socket.sendCombo(modifiers: ["alt"], key: "tab") }
            }
            ForEach(rows, id: \.self) { row in
                HStack {
                    ForEach(row, id: \.self) { key in
                        Button(key.uppercased()) { model.socket.tap(key) }
                            .buttonStyle(.bordered)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            HStack {
                Button("上一窗口") { model.socket.sendWindow(action: "switch", direction: "left") }
                Spacer()
                Button("下一窗口") { model.socket.sendWindow(action: "switch", direction: "right") }
            }
        }
        .cardStyle()
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("连接") { LabeledContent("服务器", value: model.serverAddress) }
                Section {
                    Button("退出登录", role: .destructive) {
                        Task { await model.logout(); dismiss() }
                    }
                }
            }
            .navigationTitle("设置")
            .toolbar { Button("完成") { dismiss() } }
        }
    }
}

private extension View {
    func cardStyle() -> some View {
        padding(16)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
    }
}
