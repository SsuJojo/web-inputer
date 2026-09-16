import SwiftUI

struct ControlView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingSettings = false
    @State private var showingPreview = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    statusHeader
                    PreviewCard(showingPreview: $showingPreview)
                    TextInputCard()
                    TouchpadCard()
                    KeyboardCard()
                    PowerControlView()
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 24)
            }
            .background {
                LinearGradient(colors: [Color(uiColor: .systemGroupedBackground), Color.accentColor.opacity(0.06)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
            }
            .navigationTitle("Remote Input")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("设置", systemImage: "gearshape") { showingSettings = true }
                }
            }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .sheet(isPresented: $showingPreview) { FullScreenPreview() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    model.startPreview()
                    Task { await model.refreshPowerStatus() }
                } else {
                    model.stopPreview()
                }
            }
        }
    }

    private var statusHeader: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(model.socket.state == .connected ? .green : .orange)
                .frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.socket.state.label).font(.subheadline.weight(.semibold))
                Text(model.socket.currentWindowTitle.isEmpty ? "等待窗口状态" : model.socket.currentWindowTitle)
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            Label(model.socket.latency.map { "\($0) ms" } ?? "-- ms", systemImage: "wave.3.right")
                .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }
}

private struct PreviewCard: View {
    @EnvironmentObject private var model: AppModel
    @Binding var showingPreview: Bool

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Button { model.socket.sendCombo(modifiers: ["ctrl", "win"], key: "left") } label: {
                    Label("桌面", systemImage: "chevron.left")
                }
                .buttonStyle(.bordered)
                Spacer()
                VStack(spacing: 2) {
                    Button(model.previewEnabled ? "关闭预览" : "开启预览", systemImage: model.previewEnabled ? "eye.slash" : "eye") {
                        model.setPreviewEnabled(!model.previewEnabled)
                    }
                    .font(.subheadline.weight(.semibold))
                    Text(model.socket.currentWindowTitle.isEmpty ? "当前屏幕" : model.socket.currentWindowTitle)
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Button { model.socket.sendCombo(modifiers: ["ctrl", "win"], key: "right") } label: {
                    Label("桌面", systemImage: "chevron.right")
                }
                .buttonStyle(.bordered)
            }

            ZStack {
                RoundedRectangle(cornerRadius: 14).fill(Color.black.opacity(0.85)).aspectRatio(16 / 9, contentMode: .fit)
                if let image = model.previewImage {
                    Image(uiImage: image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 14))
                } else if model.previewLoading {
                    ProgressView("正在获取屏幕…").tint(.white).foregroundStyle(.white)
                } else if model.previewEnabled {
                    VStack(spacing: 8) {
                        Image(systemName: "display.trianglebadge.exclamationmark").font(.title2)
                        Text(model.previewError ?? "预览暂不可用").font(.caption).multilineTextAlignment(.center)
                        Button("重试") { model.retryPreview() }.buttonStyle(.bordered)
                    }
                    .foregroundStyle(.white).padding()
                } else {
                    Label("屏幕预览已关闭", systemImage: "display").foregroundStyle(.white.opacity(0.7))
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { if model.previewImage != nil { showingPreview = true } }
        }
        .remoteCard()
    }
}

private struct TextInputCard: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("文本输入", systemImage: "text.cursor").sectionTitle()
            TextField("输入文字后发送", text: $model.inputText, axis: .vertical)
                .textFieldStyle(.roundedBorder).lineLimit(2...5)
            HStack {
                Button("换行", systemImage: "return") { model.inputText.append("\n") }.buttonStyle(.bordered)
                Button("剪贴板", systemImage: "clipboard") { model.syncClipboard() }.buttonStyle(.bordered)
                Spacer()
                Button("发送", systemImage: "paperplane.fill") { model.sendText() }.buttonStyle(.borderedProminent)
            }
        }
        .remoteCard()
    }
}

private struct TouchpadCard: View {
    @EnvironmentObject private var model: AppModel
    @State private var expanded = true
    @State private var lastTranslation: CGSize = .zero
    @State private var wheelTranslation: CGFloat = 0

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(spacing: 10) {
                HStack {
                    Button("上一窗口", systemImage: "chevron.left") { model.socket.sendWindow(action: "switch", direction: "left") }
                    Spacer()
                    Button("下一窗口", systemImage: "chevron.right") { model.socket.sendWindow(action: "switch", direction: "right") }
                }.buttonStyle(.bordered)
                HStack(spacing: 8) { trackpad; wheel }
                HStack {
                    mouseButton("左键", button: "left")
                    mouseButton("中键", button: "middle")
                    mouseButton("右键", button: "right")
                }
            }.padding(.top, 12)
        } label: {
            Label("触控板", systemImage: "hand.draw.fill").sectionTitle()
        }
        .remoteCard()
    }

    private var trackpad: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(Color.primary.opacity(0.055)).frame(height: 190)
            .overlay {
                VStack(spacing: 8) {
                    Image(systemName: "hand.draw").font(.title)
                    Text("单指移动 · 轻点左键").font(.caption)
                }.foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { value in
                    let dx = Int((value.translation.width - lastTranslation.width) * 1.35)
                    let dy = Int((value.translation.height - lastTranslation.height) * 1.35)
                    lastTranslation = value.translation
                    if dx != 0 || dy != 0 { model.socket.sendInput(action: "mouse_move", fields: ["x": dx, "y": dy]) }
                }
                .onEnded { value in
                    if abs(value.translation.width) < 5, abs(value.translation.height) < 5 {
                        model.socket.sendInput(action: "mouse_click", fields: ["button": "left"])
                    }
                    lastTranslation = .zero
                })
    }

    private var wheel: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(Color.primary.opacity(0.07)).frame(width: 56, height: 190)
            .overlay(Image(systemName: "arrow.up.and.down").foregroundStyle(.secondary))
            .gesture(DragGesture(minimumDistance: 4)
                .onChanged { value in
                    let delta = value.translation.height - wheelTranslation
                    wheelTranslation = value.translation.height
                    if abs(delta) >= 3 { model.socket.sendInput(action: "mouse_wheel", fields: ["dx": 0, "dy": Int(-delta / 3)]) }
                }
                .onEnded { _ in wheelTranslation = 0 })
    }

    private func mouseButton(_ title: String, button: String) -> some View {
        Button(title) { model.socket.sendInput(action: "mouse_click", fields: ["button": button]) }
            .buttonStyle(.bordered).frame(maxWidth: .infinity)
    }
}

private struct KeyboardCard: View {
    @EnvironmentObject private var model: AppModel
    @State private var heldModifiers = Set<String>()
    private let rows = [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
        ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
        ["z", "x", "c", "v", "b", "n", "m"]
    ]

    var body: some View {
        VStack(spacing: 8) {
            Label("键盘", systemImage: "keyboard.fill").sectionTitle().frame(maxWidth: .infinity, alignment: .leading)
            keyRow(["esc", "tab", "backspace", "enter"])
            HStack(spacing: 6) {
                ForEach(["shift", "ctrl", "win", "alt"], id: \.self) { modifier in
                    Button { toggleModifier(modifier) } label: {
                        Label(modifier.capitalized, systemImage: heldModifiers.contains(modifier) ? "lock.fill" : "lock.open")
                            .font(.caption.weight(.semibold)).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(heldModifiers.contains(modifier) ? .orange : .blue)
                }
            }
            HStack(spacing: 6) { Spacer(); keyButton("up", label: "↑"); Spacer() }
            HStack(spacing: 6) { keyButton("left", label: "←"); keyButton("down", label: "↓"); keyButton("right", label: "→") }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(1...12, id: \.self) { number in
                        keyButton("f\(number)", label: "F\(number)").frame(width: 48)
                    }
                }
            }
            ForEach(rows, id: \.self) { keyRow($0) }
            HStack(spacing: 6) {
                keyButton("fn", label: "Fn")
                Button("空格") { tapWithModifiers("space") }.buttonStyle(.bordered).frame(maxWidth: .infinity)
                keyButton("enter", label: "Enter")
            }
        }
        .remoteCard()
    }

    private func keyRow(_ keys: [String]) -> some View {
        HStack(spacing: 6) {
            ForEach(keys, id: \.self) { key in keyButton(key, label: key == "backspace" ? "⌫" : key.uppercased()) }
        }
    }

    private func keyButton(_ key: String, label: String) -> some View {
        Button(label) { tapWithModifiers(key) }
            .font(.caption.weight(.semibold)).buttonStyle(.bordered)
            .frame(maxWidth: .infinity).frame(minHeight: 34)
    }

    private func tapWithModifiers(_ key: String) {
        model.socket.tap(key)
    }

    private func toggleModifier(_ key: String) {
        if heldModifiers.remove(key) != nil {
            model.socket.sendInput(action: "up", fields: ["key": key])
        } else {
            heldModifiers.insert(key)
            model.socket.sendInput(action: "down", fields: ["key": key])
        }
    }
}

private struct FullScreenPreview: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if let image = model.previewImage { Image(uiImage: image).resizable().scaledToFit() }
            }
            .navigationTitle(model.socket.currentWindowTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("完成") { dismiss() } }
        }
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("连接") {
                    LabeledContent("服务器", value: model.serverAddress)
                    LabeledContent("状态", value: model.socket.state.label)
                }
                Section {
                    Button("退出登录", role: .destructive) { Task { await model.logout(); dismiss() } }
                }
            }
            .navigationTitle("设置")
            .toolbar { Button("完成") { dismiss() } }
        }
    }
}

extension View {
    func remoteCard() -> some View {
        padding(14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1) }
    }

    func sectionTitle() -> some View { font(.headline) }
}
