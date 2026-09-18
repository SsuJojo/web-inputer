import XCTest
@testable import RemoteInput

final class RemoteInputTests: XCTestCase {
    func testServerAddressAddsHTTPS() {
        XCTAssertEqual(ServerAddress.normalized("remote.example.com")?.absoluteString, "https://remote.example.com")
    }

    func testServerAddressPreservesHTTPForLAN() {
        XCTAssertEqual(ServerAddress.normalized("http://192.168.1.10:8790")?.absoluteString, "http://192.168.1.10:8790")
    }

    func testServerAddressRejectsPath() {
        XCTAssertNil(ServerAddress.normalized("https://remote.example.com/control"))
    }

    func testBackendPolicyPrefersTailscaleAndFallsBackToPublic() {
        XCTAssertEqual(
            BackendAddressPolicy.candidates(customAddress: nil),
            [URL(string: "http://100.72.54.81:8790")!, URL(string: "https://input.zszs.uno")!]
        )
    }

    func testBackendPolicyKeepsAdvancedOverrideFirst() {
        XCTAssertEqual(
            BackendAddressPolicy.candidates(customAddress: "https://custom.example.com").map(\.absoluteString),
            ["https://custom.example.com", "http://100.72.54.81:8790", "https://input.zszs.uno"]
        )
    }

    func testBackendPolicyDoesNotDuplicateBuiltInAddress() {
        XCTAssertEqual(BackendAddressPolicy.candidates(customAddress: "http://100.72.54.81:8790").count, 2)
    }

    func testPowerStatusDecoding() throws {
        let data = Data(#"{"available":true,"status":"scheduled","serverTime":1000,"scheduled":{"id":"abc","action":"sleep","status":"scheduled","delaySeconds":60,"dueAt":1060,"remainingSeconds":60}}"#.utf8)
        let status = try JSONDecoder().decode(PowerStatus.self, from: data)
        XCTAssertTrue(status.available)
        XCTAssertEqual(status.scheduled?.action, .sleep)
        XCTAssertEqual(status.scheduled?.remainingSeconds, 60)
    }
}
