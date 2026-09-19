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
            .sheet(isPresented: $showingBrowser) {
                EmbeddedBrowserView()
                    .interactiveDismissDisabled(true)
            }
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
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Button { Feedback.tap(); model.socket.sendCombo(modifiers: ["ctrl", "win"], key: "left") } label: {
                    Text("← 桌面")
                }
                .buttonStyle(.bordered).lineLimit(1).fixedSize(horizontal: true, vertical: false).frame(minHeight: 52)
                Spacer()
                Button {
                    Feedback.tap()
                    model.setPreviewEnabled(!model.previewEnabled)
                } label: {
                    VStack(spacing: 1) {
                        Text(model.previewEnabled ? "关闭预览" : "开启预览").font(.subheadline.weight(.bold))
                        Text(model.socket.currentWindowTitle.isEmpty ? "等待窗口" : "[ \(model.socket.currentWindowTitle) ]")
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                .buttonStyle(.plain).frame(maxWidth: .infinity, minHeight: 52)
                Spacer()
                Button { Feedback.tap(); model.socket.sendCombo(modifiers: ["ctrl", "win"], key: "right") } label: {
                    Text("桌面 →")
                }
                .buttonStyle(.bordered).lineLimit(1).fixedSize(horizontal: true, vertical: false).frame(minHeight: 52)
            }

            if model.previewEnabled {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(Color.black.opacity(0.85)).aspectRatio(16 / 10, contentMode: .fit)
                    if model.previewLoading, model.previewImage == nil {
                        ProgressView("正在获取屏幕…").tint(.white).foregroundStyle(.white)
                    } else if let image = model.previewImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        if model.previewError != nil {
                            VStack {
                                Spacer()
                                Label("连接中断，显示上一帧", systemImage: "exclamationmark.triangle.fill")
                                    .font(.caption.weight(.semibold))
                                    .padding(8)
                                    .frame(maxWidth: .infinity)
                                    .background(.black.opacity(0.7))
                            }
                        }
                    } else {
                        VStack(spacing: 8) {
                            Image(systemName: "display.trianglebadge.exclamationmark").font(.title2)
                            Text(model.previewError ?? "预览暂不可用").font(.caption).multilineTextAlignment(.center)
                            Button("重试") { Feedback.tap(); model.retryPreview() }.buttonStyle(.bordered)
                        }
                        .foregroundStyle(.white)
                        .padding()
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture { if model.previewImage != nil { showingPreview = true } }
            }

        }
        .remoteCard()
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
                    .buttonStyle(.borderedProminent).frame(maxWidth: .infinity, minHeight: 48)
                Button("同步剪贴板", systemImage: "clipboard") { Feedback.tap(); model.syncClipboard() }
                    .buttonStyle(.bordered).frame(maxWidth: .infinity, minHeight: 48)
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
            }.buttonStyle(.plain).foregroundStyle(.blue).frame(minHeight: 54)
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

private struct PressAwareKeyStyle: ButtonStyle {
    var onPressChanged: ((Bool) -> Void)? = nil

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, isPressed in
                onPressChanged?(isPressed)
            }
    }
}

private struct KeyboardCard: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("keyBubblesEnabled") private var keyBubblesEnabled = true
    @State private var activeBubble: String?
    @State private var bubbleTask: Task<Void, Never>?
    @State private var fnActive = false
    @State private var pressedKeys: Set<String> = []
    private let letterRows = [
        ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
        ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
        ["z", "x", "c", "v", "b", "n", "m", "backspace"]
    ]

    private var isCompact: Bool { horizontalSizeClass == .compact }
    private var rowGap: CGFloat { isCompact ? 8 : 10 }
    private var arrowGap: CGFloat { isCompact ? 8 : 10 }
    private var keyGridGap: CGFloat { isCompact ? 6 : 8 }
    private var keyGap: CGFloat { isCompact ? 5 : 8 }
    private var arrowMargin: CGFloat { isCompact ? 9 : 12 }
    private var keyCornerRadius: CGFloat { isCompact ? 9 : 12 }
    private var controlCornerRadius: CGFloat { isCompact ? 11 : 12 }
    private var keyInsets: CGFloat { isCompact ? 9 : 13 }
    private var horizontalOutset: CGFloat { isCompact ? -2 : 2 }
    private var digitKeys: [String] {
        fnActive ? (1...12).map { "f\($0)" } : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]
    }
    private var keySurface: Color {
        colorScheme == .dark
            ? Color(red: 0.0667, green: 0.0941, blue: 0.1529)
            : Color(red: 0.9451, green: 0.9608, blue: 0.9765)
    }
    private var keyText: Color {
        colorScheme == .dark
            ? Color(red: 0.898, green: 0.9059, blue: 0.9216)
            : Color(red: 0.0588, green: 0.0902, blue: 0.1647)
    }
    private var keyBorder: Color {
        colorScheme == .dark
            ? Color(red: 0.5804, green: 0.6392, blue: 0.7216).opacity(0.22)
            : Color(red: 0.0588, green: 0.0902, blue: 0.1647).opacity(0.12)
    }
    private var actionGradient: LinearGradient {
        LinearGradient(
            colors: [Color(red: 0.0549, green: 0.6471, blue: 0.9137), Color(red: 0.1451, green: 0.3882, blue: 0.9216)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
    private var modifierActiveGradient: LinearGradient {
        LinearGradient(
            colors: [Color(red: 0.9765, green: 0.451, blue: 0.0863), Color(red: 0.9373, green: 0.2667, blue: 0.2667)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
    private var fnActiveGradient: LinearGradient {
        LinearGradient(
            colors: [Color(red: 0.1333, green: 0.7725, blue: 0.3686), Color(red: 0.0549, green: 0.6471, blue: 0.9137)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
    private var panelColor: Color {
        colorScheme == .dark
            ? Color(red: 0.0588, green: 0.0902, blue: 0.1647).opacity(0.86)
            : Color.white.opacity(0.88)
    }
    private var panelBorder: Color {
        colorScheme == .dark
            ? Color(red: 0.5804, green: 0.6392, blue: 0.7216).opacity(0.22)
            : Color(red: 0.0588, green: 0.0902, blue: 0.1647).opacity(0.12)
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: rowGap) {
                specialKeyRow
                modifierRow
            }
            .padding(.top, rowGap)

            arrowKeyboard
                .padding(.vertical, arrowMargin)

            letterKeyboard
        }
        .padding(keyInsets)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: isCompact ? 14 : 16, style: .circular))
        .overlay {
            RoundedRectangle(cornerRadius: isCompact ? 14 : 16, style: .circular)
                .fill(panelColor)
        }
        .overlay {
            RoundedRectangle(cornerRadius: isCompact ? 14 : 16, style: .circular)
                .stroke(panelBorder, lineWidth: 1)
        }
        .shadow(
            color: colorScheme == .dark ? .black.opacity(0.25) : Color(red: 0.0588, green: 0.0902, blue: 0.1647).opacity(0.12),
            radius: 20,
            x: 0,
            y: 18
        )
        .padding(.horizontal, horizontalOutset)
        .onDisappear {
            for key in pressedKeys { _ = model.socket.keyUp(key) }
            pressedKeys.removeAll()
        }
    }

    private var modifierRow: some View {
        HStack(spacing: rowGap) {
            ForEach(["shift", "ctrl", "win", "alt"], id: \.self) { modifier in
                modifierButton(modifier)
            }
        }
    }

    private var specialKeyRow: some View {
        HStack(spacing: rowGap) {
            actionKeyButton("esc", label: "Esc")
            actionKeyButton("tab", label: "Tab")
            actionKeyButton("backspace", label: "⌫")
            actionKeyButton("enter", label: "Enter")
        }
    }

    private var arrowKeyboard: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: arrowGap), count: 3)
        return LazyVGrid(columns: columns, spacing: arrowGap) {
            Color.clear
            actionKeyButton("up", label: "↑")
            Color.clear
            actionKeyButton("left", label: "←")
            actionKeyButton("down", label: "↓")
            actionKeyButton("right", label: "→")
        }
    }

    private var letterKeyboard: some View {
        VStack(spacing: keyGridGap) {
            keyboardRow(digitKeys, horizontalInset: 0, holdable: false, digitLabels: true)
                .animation(fnActive ? .easeOut(duration: 0.13) : nil, value: fnActive)
            keyboardRow(letterRows[0], horizontalInset: 0, holdable: true)
            keyboardRow(letterRows[1], horizontalInset: 0.04, holdable: true)
            keyboardRow(letterRows[2], horizontalInset: isCompact ? 0.05 : 0.096, holdable: true)
            spaceRow
        }
    }

    private func modifierButton(_ modifier: String) -> some View {
        let isHeld = model.socket.heldKeys.contains(modifier)
        return Button { toggleModifier(modifier) } label: {
            HStack(spacing: 4) {
                Text(isHeld ? "🔒" : "🔓").font(.system(size: 14))
                Text(modifier.capitalized).font(.system(size: 14, weight: .bold))
            }
        }
        .buttonStyle(PressAwareKeyStyle())
        .frame(maxWidth: .infinity, minHeight: 48)
        .foregroundStyle(.white)
        .background(isHeld ? modifierActiveGradient : actionGradient, in: RoundedRectangle(cornerRadius: controlCornerRadius, style: .circular))
        .accessibilityLabel(modifier.capitalized)
        .accessibilityValue(isHeld ? "已锁定" : "未锁定")
        .overlay(alignment: .top) { keyBubble(modifier.capitalized, key: modifier) }
    }

    private func keyboardRow(
        _ keys: [String],
        horizontalInset: CGFloat,
        holdable: Bool,
        digitLabels: Bool = false
    ) -> some View {
        GeometryReader { geometry in
            HStack(spacing: keyGap) {
                ForEach(keys, id: \.self) { key in
                    let label = digitLabels && fnActive ? String(key.dropFirst()) : (key == "backspace" ? "⌫" : key.uppercased())
                    if holdable {
                        heldKeyButton(key, label: label).frame(maxWidth: .infinity)
                    } else {
                        keyButton(key, label: label, fontSize: fnActive && digitLabels ? 13 : 14).frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(.horizontal, geometry.size.width * horizontalInset)
        }
        .frame(height: 48)
    }

    private var spaceRow: some View {
        GeometryReader { geometry in
            let inset = geometry.size.width * (isCompact ? 0.04 : 0.06)
            let gaps = keyGap * 2
            let flexibleWidth = max(0, geometry.size.width - inset * 2 - gaps - (isCompact ? 40 : 44))
            HStack(spacing: keyGap) {
                fnButton.frame(width: isCompact ? 40 : 44)
                keyButton("space", label: "空格", fontSize: 14)
                    .frame(width: flexibleWidth / 1.42)
                keyButton("enter", label: "Enter", fontSize: 14)
                    .frame(width: flexibleWidth * 0.42 / 1.42)
            }
            .padding(.horizontal, inset)
        }
        .frame(height: 48)
    }

    private var fnButton: some View {
        Button(action: toggleFn) {
            Text("Fn").font(.system(size: 14, weight: .bold))
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(fnActive ? .white : keyText)
                .background {
                    if fnActive {
                        RoundedRectangle(cornerRadius: keyCornerRadius, style: .circular).fill(fnActiveGradient)
                    } else {
                        RoundedRectangle(cornerRadius: keyCornerRadius, style: .circular).fill(keySurface)
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: keyCornerRadius, style: .circular)
                        .stroke(fnActive ? .clear : keyBorder, lineWidth: 1)
                }
        }
        .buttonStyle(PressAwareKeyStyle())
        .accessibilityLabel("Fn")
        .accessibilityValue(fnActive ? "已锁定" : "未锁定")
        .accessibilityAddTraits(fnActive ? .isSelected : [])
        .overlay(alignment: .top) { keyBubble("Fn", key: "fn") }
    }

    private func actionKeyButton(_ key: String, label: String) -> some View {
        Button { tapWithModifiers(key) } label: {
            Text(label).font(.system(size: 14, weight: .bold))
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(.white)
                .background(actionGradient, in: RoundedRectangle(cornerRadius: controlCornerRadius, style: .circular))
        }
        .buttonStyle(PressAwareKeyStyle())
        .overlay(alignment: .top) { keyBubble(label, key: key) }
    }

    private func keyButton(_ key: String, label: String, fontSize: CGFloat = 14) -> some View {
        Button { tapWithModifiers(key) } label: {
            keyFace(label, fontSize: fontSize)
        }
        .buttonStyle(PressAwareKeyStyle())
        .overlay(alignment: .top) { keyBubble(label, key: key) }
    }

    private func heldKeyButton(_ key: String, label: String) -> some View {
        Button {} label: {
            keyFace(label, fontSize: 14)
        }
        .buttonStyle(PressAwareKeyStyle { isPressed in
            if isPressed { beginHolding(key) } else { endHolding(key) }
        })
        .overlay(alignment: .top) { keyBubble(label, key: key) }
    }

    private func keyFace(_ label: String, fontSize: CGFloat) -> some View {
        Text(label).font(.system(size: fontSize, weight: .bold))
            .frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(keyText)
            .background(keySurface, in: RoundedRectangle(cornerRadius: keyCornerRadius, style: .circular))
            .overlay {
                RoundedRectangle(cornerRadius: keyCornerRadius, style: .circular)
                    .stroke(keyBorder, lineWidth: 1)
            }
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

    private func toggleFn() {
        if fnActive {
            fnActive = false
        } else {
            withAnimation(.easeOut(duration: 0.13)) { fnActive = true }
        }
        Feedback.tap()
        showBubble("fn")
    }

    private func beginHolding(_ key: String) {
        guard !pressedKeys.contains(key) else { return }
        guard model.socket.keyDown(key) else { Feedback.error(); return }
        pressedKeys.insert(key)
        Feedback.tap()
        showBubble(key)
    }

    private func endHolding(_ key: String) {
        guard pressedKeys.remove(key) != nil else { return }
        if !model.socket.keyUp(key) { Feedback.error() }
    }

    @ViewBuilder
    private func keyBubble(_ label: String, key: String) -> some View {
        if keyBubblesEnabled, activeBubble == key {
            let bubbleColor = Color(red: 0.8863, green: 0.9098, blue: 0.9412).opacity(0.96)
            Text(label).font(.system(size: 28, weight: .heavy)).foregroundStyle(Color(red: 0.0078, green: 0.0235, blue: 0.0902))
                .lineSpacing(-5)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .frame(minWidth: 52)
                .background(bubbleColor, in: RoundedRectangle(cornerRadius: 18, style: .circular))
                .overlay(alignment: .bottom) {
                    RoundedRectangle(cornerRadius: 2, style: .circular)
                        .fill(bubbleColor)
                        .frame(width: 14, height: 14)
                        .rotationEffect(.degrees(45))
                        .offset(y: 7)
                }
                .shadow(color: .black.opacity(0.38), radius: 14, x: 0, y: 12)
                .offset(y: -64)
                .allowsHitTesting(false)
                .transition(.scale.combined(with: .opacity))
                .zIndex(50)
        }
    }

    private func showBubble(_ key: String) {
        guard keyBubblesEnabled else { return }
        bubbleTask?.cancel()
        withAnimation(.easeOut(duration: 0.15)) { activeBubble = key }
        bubbleTask = Task {
            try? await Task.sleep(for: .milliseconds(150))
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
            .background(Color(uiColor: .secondarySystemGroupedBackground).opacity(0.94), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.12), lineWidth: 1) }
    }

    func sectionTitle() -> some View { font(.headline) }

}
