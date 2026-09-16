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
}

