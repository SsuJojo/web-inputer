import SwiftUI

struct ControlView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @State private var showingSettings = false
    @State private var showingPreview = false
    @State private var showingBrowser = false
    @State private var touchpadExpanded = false
    @State private var powerExpanded = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 10, pinnedViews: [.sectionHeaders]) {
                    statusHeader
                    Section {
                        TextInputCard()
                        WindowTouchpadCard(expanded: $touchpadExpanded)
                        KeyboardCard()
                        PowerControlView(expanded: $powerExpanded)
                    } header: {
                        PreviewCard(showingPreview: $showingPreview)
                            .background(pageBackground)
                            .zIndex(20)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 12)
            }
            .background {
                pageBackground.ignoresSafeArea()
            }
            .navigationTitle("Remote Input")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("网页版", systemImage: "globe") { Feedback.tap(); showingBrowser = true }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("设置", systemImage: "gearshape") { Feedback.tap(); showingSettings = true }
                }
            }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .sheet(isPresented: $showingPreview) { FullScreenPreview() }
            .sheet(isPresented: $showingBrowser) { EmbeddedBrowserView() }
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

    private var pageBackground: some View {
        Group {
            if colorScheme == .dark {
                LinearGradient(colors: [Color(red: 0.025, green: 0.055, blue: 0.16), Color(red: 0.045, green: 0.09, blue: 0.22)], startPoint: .top, endPoint: .bottom)
            } else {
                LinearGradient(colors: [Color(uiColor: .systemGroupedBackground), Color(red: 0.89, green: 0.94, blue: 1)], startPoint: .top, endPoint: .bottom)
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

private struct PreviewCard: View {
    @EnvironmentObject private var model: AppModel
    @Binding var showingPreview: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Button { Feedback.tap(); model.socket.sendCombo(modifiers: ["ctrl", "win"], key: "left") } label: {
                    Text("← 桌面")
                }
                .buttonStyle(.bordered).lineLimit(1).fixedSize(horizontal: true, vertical: false)
                Spacer()
                Button {
                    Feedback.tap()
                    if !model.previewEnabled { model.setPreviewEnabled(true) }
                    showingPreview = true
                } label: {
                    VStack(spacing: 1) {
                        Text("打开预览").font(.subheadline.weight(.bold))
                        Text(model.socket.currentWindowTitle.isEmpty ? "等待窗口" : "[ \(model.socket.currentWindowTitle) ]")
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                .buttonStyle(.plain).frame(maxWidth: .infinity)
                Spacer()
                Button { Feedback.tap(); model.socket.sendCombo(modifiers: ["ctrl", "win"], key: "right") } label: {
                    Text("桌面 →")
                }
                .buttonStyle(.bordered).lineLimit(1).fixedSize(horizontal: true, vertical: false)
            }

        }
        .remoteCard(compact: true)
    }
}

private struct TextInputCard: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("文本输入").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            HStack(spacing: 8) {
                TextField("输入文字后按 Enter 发送", text: $model.inputText)
                    .onSubmit { model.sendText() }
                Button("换行", systemImage: "return") { Feedback.tap(); model.inputText.append("\n") }.labelStyle(.iconOnly)
            }
                .padding(.horizontal, 12).frame(height: 44)
                .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.12), lineWidth: 1) }
            HStack(spacing: 8) {
                Button("发送文本", systemImage: "paperplane.fill") { Feedback.tap(); model.sendText() }
                    .buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                Button("同步剪贴板", systemImage: "clipboard") { Feedback.tap(); model.syncClipboard() }
                    .buttonStyle(.bordered).frame(maxWidth: .infinity)
            }
        }
        .remoteCard(compact: true)
    }
}

private struct WindowTouchpadCard: View {
    @EnvironmentObject private var model: AppModel
    @Binding var expanded: Bool
    @State private var lastTranslation: CGSize = .zero
    @State private var wheelTranslation: CGFloat = 0

    var body: some View {
        VStack(spacing: expanded ? 10 : 0) {
            HStack(spacing: 8) {
                Button("上一窗口", systemImage: "chevron.left") { Feedback.tap(); model.socket.sendWindow(action: "switch", direction: "left") }
                    .frame(maxWidth: .infinity)
                Button {
                    Feedback.tap()
                    expanded.toggle()
                } label: {
                    VStack(spacing: 1) {
                        Text(expanded ? "收起触控板" : "展开触控板").font(.subheadline.weight(.bold))
                        Text("按住滚轮").font(.caption2).foregroundStyle(.secondary)
                    }
                }.buttonStyle(.plain).frame(maxWidth: .infinity)
                Button("下一窗口", systemImage: "chevron.right") { Feedback.tap(); model.socket.sendWindow(action: "switch", direction: "right") }
                    .frame(maxWidth: .infinity)
            }.buttonStyle(.plain).foregroundStyle(.blue)
            if expanded {
            VStack(spacing: 10) {
                HStack(spacing: 8) { trackpad; wheel }
                HStack {
                    mouseButton("左键", button: "left")
                    mouseButton("中键", button: "middle")
                    mouseButton("右键", button: "right")
                }
            }
            }
        }
        .remoteCard(compact: !expanded)
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
        Button(title) { Feedback.tap(); model.socket.sendInput(action: "mouse_click", fields: ["button": button]) }
            .buttonStyle(.bordered).frame(maxWidth: .infinity)
    }
}

private struct KeyboardCard: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage("keyBubblesEnabled") private var keyBubblesEnabled = true
    @State private var activeBubble: String?
    @State private var bubbleTask: Task<Void, Never>?
    private let rows = [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
        ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
        ["z", "x", "c", "v", "b", "n", "m"]
    ]

    var body: some View {
        VStack(spacing: 6) {
            specialKeyRow
            modifierRow
            HStack(spacing: 6) { Spacer(); keyButton("up", label: "↑").frame(maxWidth: 116); Spacer() }
            HStack(spacing: 6) { keyButton("left", label: "←"); keyButton("down", label: "↓"); keyButton("right", label: "→") }
            letterKeyboard
            HStack(spacing: 6) {
                keyButton("fn", label: "Fn")
                keyButton("space", label: "空格")
                keyButton("enter", label: "Enter")
            }
        }
        .remoteCard(compact: true)
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
        VStack(spacing: 5) {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    HStack(spacing: 6) {
                        if index >= 2 { Spacer(minLength: CGFloat(index - 1) * 14) }
                        ForEach(row, id: \.self) { key in
                            keyButton(key, label: key.uppercased())
                        }
                        if index >= 2 { Spacer(minLength: CGFloat(index - 1) * 14) }
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
            .overlay(alignment: .top) { keyBubble(modifier.capitalized, key: modifier) }
        } else {
            Button { toggleModifier(modifier) } label: {
                Label(modifier.capitalized, systemImage: "lock.open").font(.caption.weight(.semibold)).frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered).tint(.blue).accessibilityValue("未锁定")
            .overlay(alignment: .top) { keyBubble(modifier.capitalized, key: modifier) }
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
            .keyboardKeyStyle()
            .overlay(alignment: .top) { keyBubble(label, key: key) }
    }

    private func tapWithModifiers(_ key: String) {
        if model.socket.tap(key) {
            Feedback.tap()
            showBubble(key)
        } else {
            Feedback.error()
        }
    }

    private func toggleModifier(_ key: String) {
        let accepted: Bool
        if model.socket.heldKeys.contains(key) {
            accepted = model.socket.keyUp(key)
        } else {
            accepted = model.socket.keyDown(key)
        }
        if accepted {
            Feedback.tap()
            showBubble(key)
        } else {
            Feedback.error()
        }
    }

    @ViewBuilder
    private func keyBubble(_ label: String, key: String) -> some View {
        if keyBubblesEnabled, activeBubble == key {
            Text(label).font(.title3.bold()).padding(.horizontal, 12).padding(.vertical, 8)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
                .offset(y: -44).allowsHitTesting(false).transition(.scale.combined(with: .opacity)).zIndex(50)
        }
    }

    private func showBubble(_ key: String) {
        guard keyBubblesEnabled else { return }
        bubbleTask?.cancel()
        withAnimation(.spring(response: 0.18)) { activeBubble = key }
        bubbleTask = Task {
            try? await Task.sleep(for: .milliseconds(180))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.12)) { activeBubble = nil }
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
                if let image = model.previewImage {
                    ZoomableImageView(image: image)
                } else if model.previewLoading {
                    ProgressView("正在获取屏幕…").tint(.white).foregroundStyle(.white)
                } else {
                    ContentUnavailableView("预览暂不可用", systemImage: "display.trianglebadge.exclamationmark", description: Text(model.previewError ?? "请重试"))
                        .foregroundStyle(.white)
                }
            }
            .navigationTitle(model.socket.currentWindowTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(model.previewEnabled ? "暂停" : "开启", systemImage: model.previewEnabled ? "pause" : "play") {
                        Feedback.tap(); model.setPreviewEnabled(!model.previewEnabled)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { Button("完成") { Feedback.tap(); dismiss() } }
            }
        }
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage("appearance") private var appearance = AppAppearance.system.rawValue
    @AppStorage("hapticsEnabled") private var hapticsEnabled = true
    @AppStorage("keyBubblesEnabled") private var keyBubblesEnabled = true
    @State private var showingAdvanced = false

    var body: some View {
        NavigationStack {
            Form {
                Section("连接") {
                    LabeledContent("线路", value: model.activeBackendDescription)
                    LabeledContent("状态", value: model.socket.state.label)
                    DisclosureGroup("高级后端设置", isExpanded: $showingAdvanced) {
                        TextField("自定义 URL", text: $model.serverAddress)
                            .textInputAutocapitalization(.never).keyboardType(.URL).autocorrectionDisabled()
                        Text("默认优先 Tailscale，不可用时自动回退 input.zszs.uno。").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("外观与反馈") {
                    Picker("外观", selection: $appearance) {
                        ForEach(AppAppearance.allCases) { item in Text(item.title).tag(item.rawValue) }
                    }.pickerStyle(.segmented)
                    Toggle("按键震动", isOn: $hapticsEnabled)
                    Toggle("按键气泡", isOn: $keyBubblesEnabled)
                }
                Section {
                    Button("退出登录", role: .destructive) { Feedback.tap(); Task { await model.logout(); dismiss() } }
                }
            }
            .navigationTitle("设置")
            .toolbar { Button("完成") { Feedback.tap(); dismiss() } }
        }
    }
}

extension View {
    func remoteCard(compact: Bool = false) -> some View {
        padding(compact ? 10 : 14)
            .background(Color(uiColor: .secondarySystemGroupedBackground).opacity(0.94), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.primary.opacity(0.12), lineWidth: 1) }
    }

    func sectionTitle() -> some View { font(.headline) }

    func keyboardKeyStyle() -> some View {
        buttonStyle(.plain)
            .font(.caption.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 38)
            .background(Color(uiColor: .tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Color.primary.opacity(0.1), lineWidth: 1) }
            .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }
}
