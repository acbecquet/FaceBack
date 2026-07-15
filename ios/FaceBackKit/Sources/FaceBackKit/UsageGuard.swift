import Foundation

/// Client-side courtesy throttle. Enforces only a minimum interval between
/// generations; the real daily cap is enforced server-side. Mirrors
/// `web/src/units/usageGuard.ts`.
public enum UsageGuard {
    /// Minimum seconds between generations (web `MIN_GENERATION_INTERVAL_MS = 3000`).
    public static let minInterval: TimeInterval = 3

    public enum Decision: Equatable {
        case allowed
        case blocked(reason: String)
    }

    /// Blocks with reason `too_soon` when the most recent entry is within
    /// `minInterval` of `now`.
    public static func decide(now: Date, history: [Date]) -> Decision {
        if let last = history.max(), now.timeIntervalSince(last) < minInterval {
            return .blocked(reason: "too_soon")
        }
        return .allowed
    }

    /// Appends `now` and prunes entries older than 24 hours.
    public static func record(now: Date, history: [Date]) -> [Date] {
        let cutoff = now.addingTimeInterval(-24 * 60 * 60)
        return (history + [now]).filter { $0 >= cutoff }
    }
}
