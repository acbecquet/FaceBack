import XCTest
@testable import FaceBackKit

final class UsageGuardTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 100_000)

    func testBlocksWithinInterval() {
        let history = [now.addingTimeInterval(-1)] // 1s ago
        XCTAssertEqual(UsageGuard.decide(now: now, history: history), .blocked(reason: "too_soon"))
    }

    func testAllowsAfterInterval() {
        XCTAssertEqual(UsageGuard.decide(now: now, history: [now.addingTimeInterval(-4)]), .allowed)
    }

    func testAllowsEmptyHistory() {
        XCTAssertEqual(UsageGuard.decide(now: now, history: []), .allowed)
    }

    func testRecordAppendsAndPrunesOldEntries() {
        let old = now.addingTimeInterval(-25 * 60 * 60)  // 25h ago -> pruned
        let recent = now.addingTimeInterval(-60 * 60)     // 1h ago -> kept
        let result = UsageGuard.record(now: now, history: [old, recent])
        XCTAssertTrue(result.contains(now))
        XCTAssertTrue(result.contains(recent))
        XCTAssertFalse(result.contains(old))
    }
}
