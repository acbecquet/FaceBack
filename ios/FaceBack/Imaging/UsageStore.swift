import Foundation

/// Client-side throttle history, persisted in `UserDefaults`. The real daily cap
/// is enforced server-side; this is the courtesy interval only. Mirrors the
/// `localStorage["faceback.usage"]` store in `web/src/units/usageGuard.ts`.
enum UsageStore {
    private static let key = "faceback.usage"

    static func load() -> [Date] {
        let seconds = UserDefaults.standard.array(forKey: key) as? [Double] ?? []
        return seconds.map(Date.init(timeIntervalSince1970:))
    }

    static func save(_ history: [Date]) {
        UserDefaults.standard.set(history.map(\.timeIntervalSince1970), forKey: key)
    }
}
