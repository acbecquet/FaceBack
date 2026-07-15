import XCTest
@testable import FaceBack

/// Minimal app-target unit test. Its job in Phase 1 is to prove the `xcodebuild
/// test` pipeline runs on the Simulator and that the app module compiles and is
/// importable. Real screen and model tests arrive in later phases.
final class AppSmokeTests: XCTestCase {
    func testAppModuleCompilesAndLoads() {
        let app = FaceBackApp()
        XCTAssertNotNil(app)
    }
}
