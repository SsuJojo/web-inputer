import UIKit

enum Feedback {
    static func tap() {
        guard UserDefaults.standard.object(forKey: "hapticsEnabled") as? Bool ?? true else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.72)
    }

    static func error() {
        guard UserDefaults.standard.object(forKey: "hapticsEnabled") as? Bool ?? true else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
