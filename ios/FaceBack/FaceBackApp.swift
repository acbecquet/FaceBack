import SwiftUI
import FaceBackKit

@main
struct FaceBackApp: App {
    @State private var session = SessionModel(
        api: APIClient(baseURL: AppConfig.baseURL, session: .fbSession)
    )

    var body: some Scene {
        WindowGroup {
            RootView(session: session)
                .task { await session.refresh() }
                .preferredColorScheme(.light)
        }
    }
}
