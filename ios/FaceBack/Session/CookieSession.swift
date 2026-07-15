import Foundation

extension URLSession {
    /// A session that persists and resends the `fb_session` cookie via the
    /// shared cookie storage, reproducing the web client's `credentials: "include"`.
    static let fbSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        return URLSession(configuration: config)
    }()
}
