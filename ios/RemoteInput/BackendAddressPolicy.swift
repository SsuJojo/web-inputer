import Foundation

enum BackendAddressPolicy {
    static let tailscaleURL = URL(string: "http://100.72.54.81:8790")!
    static let publicURL = URL(string: "https://input.zszs.uno")!

    static var defaultAddress: String {
        tailscaleURL.absoluteString
    }

    static func candidates(customAddress: String?) -> [URL] {
        let customURL = customAddress.flatMap(ServerAddress.normalized)
        return unique([customURL, tailscaleURL, publicURL].compactMap { $0 })
    }

    private static func unique(_ urls: [URL]) -> [URL] {
        var seen = Set<String>()
        return urls.filter { seen.insert($0.absoluteString).inserted }
    }
}
