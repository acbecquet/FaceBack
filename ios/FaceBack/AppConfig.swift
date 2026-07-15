import Foundation

/// App-wide configuration.
enum AppConfig {
    /// Base URL of the deployed Cloudflare backend, joined with `/api` paths by
    /// `APIClient`. Confirm this matches the production origin before device testing.
    static let baseURL = URL(string: "https://faceback.pages.dev/api")!
}
