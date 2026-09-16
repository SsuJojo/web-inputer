import Foundation

enum PowerAction: String, Codable, CaseIterable, Identifiable {
    case shutdown
    case restart
    case sleep
    case hibernate
    case lock

    var id: String { rawValue }

    var title: String {
        switch self {
        case .shutdown: "关机"
        case .restart: "重启"
        case .sleep: "睡眠"
        case .hibernate: "休眠"
        case .lock: "锁屏"
        }
    }

    var symbol: String {
        switch self {
        case .shutdown: "power"
        case .restart: "arrow.clockwise"
        case .sleep: "moon.zzz.fill"
        case .hibernate: "moon.stars.fill"
        case .lock: "lock.fill"
        }
    }

    var tint: String {
        switch self {
        case .shutdown: "red"
        case .restart: "orange"
        case .sleep, .hibernate: "indigo"
        case .lock: "blue"
        }
    }
}

struct PowerStatus: Decodable {
    let available: Bool
    let status: String
    let serverTime: Double
    let message: String?
    let scheduled: ScheduledPowerStatus?
}

struct ScheduledPowerStatus: Decodable {
    let id: String
    let action: PowerAction
    let status: String
    let delaySeconds: Double
    let dueAt: Double
    let remainingSeconds: Double
}

enum PowerScheduleMode: String, CaseIterable, Identifiable {
    case now
    case countdown
    case time

    var id: String { rawValue }

    var title: String {
        switch self {
        case .now: "立即执行"
        case .countdown: "倒计时"
        case .time: "指定时间"
        }
    }
}

