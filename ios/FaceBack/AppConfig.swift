import Foundation

/// App-wide configuration.
enum AppConfig {
    /// Base URL of the deployed Cloudflare backend, joined with `/api` paths by
    /// `APIClient`. This is the production custom domain per docs/superpowers/DEPLOY.md.
    static let baseURL = URL(string: "https://faceback.acb-apps.com/api")!
}
