import SwiftUI
import FaceBackKit

@main
struct FaceBackApp: App {
    private let api: APIClient
    @State private var session: SessionModel

    init() {
        let api = APIClient(baseURL: AppConfig.baseURL, session: .fbSession)
        self.api = api
        _session = State(initialValue: SessionModel(api: api))
    }

    var body: some Scene {
        WindowGroup {
            RootView(api: api, session: session)
                .task { await session.refresh() }
                .preferredColorScheme(.light)
        }
    }
}
