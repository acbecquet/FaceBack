import XCTest
@testable import FaceBackKit

final class GenerationFlowTests: XCTestCase {
    /// Reference-type recorder so the injected closures can report back.
    private final class Spy {
        var generateCalls = 0
        var savedHistory: [Date]?
    }

    private let out1 = ImagePayload(base64: "OUT1", mimeType: "image/jpeg")
    private let out2 = ImagePayload(base64: "OUT2", mimeType: "image/jpeg")

    private func deps(
        now: Date = Date(timeIntervalSince1970: 10_000),
        history: [Date] = [],
        inputHasFace: Bool = true,
        outputHasFace: Bool = false,
        spy: Spy
    ) -> GenerationDeps {
        let results = [out1, out2]
        return GenerationDeps(
            now: { now },
            loadHistory: { history },
            saveHistory: { spy.savedHistory = $0 },
            inputHasFace: { inputHasFace },
            downscale: { ImagePayload(base64: "ENC", mimeType: "image/jpeg") },
            generate: { _ in
                let index = min(spy.generateCalls, results.count - 1)
                spy.generateCalls += 1
                return results[index]
            },
            outputHasFace: { _ in outputHasFace }
        )
    }

    func testHappyPathReturnsResultAndRecordsUsage() async throws {
        let spy = Spy()
        let result = try await GenerationFlow.run(deps(spy: spy))
        XCTAssertEqual(result, out1)
        XCTAssertEqual(spy.generateCalls, 1)
        XCTAssertEqual(spy.savedHistory?.count, 1)
    }

    func testThrottleThrowsTooSoonWithoutGenerating() async {
        let spy = Spy()
        let now = Date(timeIntervalSince1970: 10_000)
        let d = deps(now: now, history: [now.addingTimeInterval(-0.5)], spy: spy)
        do {
            _ = try await GenerationFlow.run(d)
            XCTFail("expected tooSoon")
        } catch let error as GenerationFlow.FlowError {
            XCTAssertEqual(error, .tooSoon)
        } catch {
            XCTFail("wrong error: \(error)")
        }
        XCTAssertEqual(spy.generateCalls, 0)
    }

    func testNoFaceThrowsWithoutGenerating() async {
        let spy = Spy()
        do {
            _ = try await GenerationFlow.run(deps(inputHasFace: false, spy: spy))
            XCTFail("expected noFace")
        } catch let error as GenerationFlow.FlowError {
            XCTAssertEqual(error, .noFace)
        } catch {
            XCTFail("wrong error: \(error)")
        }
        XCTAssertEqual(spy.generateCalls, 0)
    }

    func testRegeneratesOnceWhenOutputStillHasFace() async throws {
        let spy = Spy()
        let result = try await GenerationFlow.run(deps(outputHasFace: true, spy: spy))
        XCTAssertEqual(spy.generateCalls, 2)
        XCTAssertEqual(result, out2)
    }
}
