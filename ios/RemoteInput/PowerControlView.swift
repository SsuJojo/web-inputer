import SwiftUI

struct PowerControlView: View {
    @EnvironmentObject private var model: AppModel
    @State private var expanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(spacing: 12) {
                if let scheduled = model.powerStatus?.scheduled {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        HStack {
                            Label("计划\(scheduled.action.title)", systemImage: "clock.badge.checkmark")
                            Spacer()
                            Text(model.powerRemainingText(now: context.date) ?? "即将执行").font(.caption.monospacedDigit())
                        }
                        .padding(10).background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                    }
                }

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(PowerAction.allCases) { action in
                        Button { model.openPowerConfirmation(action) } label: {
                            VStack(spacing: 5) {
                                Image(systemName: action.symbol).font(.title3)
                                Text(action.title).font(.caption.weight(.semibold))
                            }.frame(maxWidth: .infinity, minHeight: 52)
                        }
                        .buttonStyle(.bordered).disabled(model.powerLoading)
                    }
                    Button(role: .destructive) { Task { await model.cancelPowerSchedule() } } label: {
                        VStack(spacing: 5) {
                            Image(systemName: "xmark.circle").font(.title3)
                            Text("取消计划").font(.caption.weight(.semibold))
                        }.frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.bordered).disabled(model.powerLoading || model.powerStatus?.scheduled == nil)
                }
                if let error = model.powerError { Text(error).font(.caption).foregroundStyle(.red) }
            }.padding(.top, 12)
        } label: {
            HStack {
                Label("电源控制", systemImage: "power").sectionTitle()
                Spacer()
                if model.powerLoading { ProgressView().controlSize(.small) }
                Button("刷新", systemImage: "arrow.clockwise") { Task { await model.refreshPowerStatus() } }.labelStyle(.iconOnly)
            }
        }
        .remoteCard()
        .sheet(item: $model.selectedPowerAction) { action in
            PowerConfirmationView(action: action).presentationDetents([.medium, .large])
        }
        .task { await model.refreshPowerStatus() }
    }
}

private struct PowerConfirmationView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let action: PowerAction

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("执行方式", selection: $model.powerScheduleMode) {
                        ForEach(PowerScheduleMode.allCases) { mode in Text(mode.title).tag(mode) }
                    }.pickerStyle(.segmented)
                    if model.powerScheduleMode == .countdown {
                        Stepper("\(model.powerDelayMinutes) 分钟后", value: $model.powerDelayMinutes, in: 1...1440)
                    } else if model.powerScheduleMode == .time {
                        DatePicker("执行时间", selection: $model.powerScheduledTime, displayedComponents: .hourAndMinute)
                    }
                }
                Section("安全确认") {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(model.powerConfirmation >= 0.92 ? "已确认，可以执行" : "将滑块拖到最右侧").font(.subheadline.weight(.semibold))
                        Slider(value: $model.powerConfirmation, in: 0...1).tint(model.powerConfirmation >= 0.92 ? .green : .orange)
                        Text("请确认当前连接的是正确的电脑。未滑到阈值不会发送指令。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Button {
                        Task { if await model.performSelectedPowerAction() { dismiss() } }
                    } label: {
                        HStack {
                            Spacer()
                            if model.powerLoading { ProgressView() }
                            Text("确认\(action.title)").fontWeight(.semibold)
                            Spacer()
                        }
                    }
                    .disabled(model.powerConfirmation < 0.92 || model.powerLoading)
                }
            }
            .navigationTitle("确认\(action.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("取消") { model.selectedPowerAction = nil; dismiss() } }
        }
    }
}
