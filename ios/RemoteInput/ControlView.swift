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
                    WindowSwitchCard()
                    PowerControlView()
                    KeyboardCard()
                    TouchpadCard()
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 24)
            }
            .background {
                LinearGradient(colors: [Color(red: 0.025, green: 0.055, blue: 0.16), Color(red: 0.045, green: 0.09, blue: 0.22)], startPoint: .top, endPoint: .bottom)
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
                    model.socket.ensureConnected()
                    model.startPreview()
                    Task { await model.refreshPowerStatus() }
                } else {
                    model.socket.releaseHeldKeys()
                    model.stopPreview()
                }
            }
        }
    }

    private var statusHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                Circle()
                    .fill(model.socket.state == .connected ? .green : .orange)
                    .frame(width: 9, height: 9)
                Text(model.socket.state.label).font(.subheadline.weight(.semibold))
                Text("·").foregroundStyle(.tertiary)
                Text(model.socket.currentWindowTitle.isEmpty ? "等待窗口状态" : model.socket.currentWindowTitle)
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                Label(model.socket.latency.map { "\($0) ms" } ?? "测量中", systemImage: "wave.3.right")
                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            if let message = model.socket.operationMessage {
                Text(message).font(.caption).foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, 8)
    }
}

private struct WindowSwitchCard: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        HStack(spacing: 12) {
            Button("上一窗口", systemImage: "chevron.left") {
                model.socket.sendWindow(action: "switch", direction: "left")
            }
            .frame(maxWidth: .infinity)
            Divider().frame(height: 24)
            Button("下一窗口", systemImage: "chevron.right") {
                model.socket.sendWindow(action: "switch", direction: "right")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.blue)
        .remoteCard()
    }
}

private struct PreviewCard: View {
    @EnvironmentObject private var model: AppModel
    @Binding var showingPreview: Bool

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Button { model.socket.sendCombo(modifiers: ["ctrl", "win"], key: "left") } label: {
                    Text("← 桌面")
                }
                .buttonStyle(.bordered).lineLimit(1).fixedSize(horizontal: true, vertical: false)
                Spacer()
                VStack(spacing: 2) {
                    Button(model.previewEnabled ? "关闭预览" : "开启预览", systemImage: model.previewEnabled ? "eye.slash" : "eye") {
                        model.setPreviewEnabled(!model.previewEnabled)
                    }
                    .font(.subheadline.weight(.semibold))
                }
                Spacer()
                Button { model.socket.sendCombo(modifiers: ["ctrl", "win"], key: "right") } label: {
                    Text("桌面 →")
                }
                .buttonStyle(.bordered).lineLimit(1).fixedSize(horizontal: true, vertical: false)
            }

            ZStack {
                RoundedRectangle(cornerRadius: 14).fill(Color.black.opacity(0.85)).aspectRatio(16 / 9, contentMode: .fit)
                if !model.previewEnabled {
                    Label("屏幕预览已关闭", systemImage: "display").foregroundStyle(.white.opacity(0.7))
                } else if model.previewLoading, model.previewImage == nil {
                    ProgressView("正在获取屏幕…").tint(.white).foregroundStyle(.white)
                } else if let image = model.previewImage {
                    Image(uiImage: image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 14))
                    if model.previewError != nil {
                        VStack { Spacer(); Label("连接中断，显示上一帧", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold)).padding(8).frame(maxWidth: .infinity)
                            .background(.black.opacity(0.7)) }
                    }
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: "display.trianglebadge.exclamationmark").font(.title2)
                        Text(model.previewError ?? "预览暂不可用").font(.caption).multilineTextAlignment(.center)
                        Button("重试") { model.retryPreview() }.buttonStyle(.bordered)
                    }
                    .foregroundStyle(.white).padding()
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { if model.previewEnabled && model.previewImage != nil { showingPreview = true } }
        }
        .remoteCard()
    }
}

private struct TextInputCard: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("文本输入").sectionTitle()
            TextField("输入文字后发送", text: $model.inputText, axis: .vertical)
                .padding(12).lineLimit(2...4)
                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.12), lineWidth: 1) }
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
    @State private var expanded = false
    @State private var lastTranslation: CGSize = .zero
    @State private var wheelTranslation: CGFloat = 0

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(spacing: 10) {
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
            .fill(Color.primary.opacity(0.055)).frame(height: 140)
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
            .fill(Color.primary.opacity(0.07)).frame(width: 56, height: 140)
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
    private let rows = [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
        ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
        ["z", "x", "c", "v", "b", "n", "m"]
    ]

    var body: some View {
        VStack(spacing: 8) {
            Label("键盘", systemImage: "keyboard.fill").sectionTitle().frame(maxWidth: .infinity, alignment: .leading)
            specialKeyRow
            modifierRow
            HStack(spacing: 6) { Spacer(); keyButton("up", label: "↑"); Spacer() }
            HStack(spacing: 6) { keyButton("left", label: "←"); keyButton("down", label: "↓"); keyButton("right", label: "→") }
            functionRow
            letterKeyboard
            HStack(spacing: 6) {
                keyButton("fn", label: "Fn")
                Button("空格") { tapWithModifiers("space") }.buttonStyle(.bordered).frame(maxWidth: .infinity)
                keyButton("enter", label: "Enter")
            }
        }
        .remoteCard()
    }

    private var modifierRow: some View {
        HStack(spacing: 6) {
            ForEach(["shift", "ctrl", "win", "alt"], id: \.self) { modifier in
                modifierButton(modifier)
            }
        }
    }

    private var specialKeyRow: some View {
        HStack(spacing: 6) {
            keyButton("esc", label: "Esc")
            keyButton("tab", label: "Tab")
            keyButton("backspace", label: "⌫")
            keyButton("enter", label: "Enter")
        }
    }

    private var functionRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(1...12, id: \.self) { number in
                    keyButton("f\(number)", label: "F\(number)").frame(width: 48)
                }
            }
        }
    }

    private var letterKeyboard: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    HStack(spacing: 6) {
                        ForEach(row, id: \.self) { key in
                            keyButton(key, label: key.uppercased()).frame(width: 44)
                        }
                    }
                    .padding(.leading, index < 2 ? 0 : CGFloat(index - 1) * 22)
                }
            }
        }
    }

    @ViewBuilder
    private func modifierButton(_ modifier: String) -> some View {
        let isHeld = model.socket.heldKeys.contains(modifier)
        if isHeld {
            Button { toggleModifier(modifier) } label: {
                Label(modifier.capitalized, systemImage: "lock.fill").font(.caption.weight(.semibold)).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).tint(.orange).accessibilityValue("已锁定")
        } else {
            Button { toggleModifier(modifier) } label: {
                Label(modifier.capitalized, systemImage: "lock.open").font(.caption.weight(.semibold)).frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered).tint(.blue).accessibilityValue("未锁定")
        }
    }

    private func keyRow(_ keys: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(keys, id: \.self) { key in
                    keyButton(key, label: key == "backspace" ? "⌫" : key.uppercased()).frame(width: 44)
                }
            }
        }
    }

    private func keyButton(_ key: String, label: String) -> some View {
        Button(label) { tapWithModifiers(key) }
            .font(.caption.weight(.semibold)).buttonStyle(.bordered)
            .frame(maxWidth: .infinity).frame(minHeight: 44)
    }

    private func tapWithModifiers(_ key: String) {
        model.socket.tap(key)
    }

    private func toggleModifier(_ key: String) {
        if model.socket.heldKeys.contains(key) {
            model.socket.keyUp(key)
        } else {
            model.socket.keyDown(key)
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
            .background(Color.white.opacity(0.075), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1) }
    }

    func sectionTitle() -> some View { font(.headline) }
}
