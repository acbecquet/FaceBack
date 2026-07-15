import SwiftUI
import FaceBackKit

/// The signed-in-with-key experience: owns the `GenerationModel` and switches
/// Camera / Generating / Result on its phase. Mirrors the camera/generating/
/// result branch of `web/src/App.tsx`.
struct CameraFlowView: View {
    @State private var generation: GenerationModel
    @State private var camera = CameraModel()

    init(api: FaceBackAPI, session: SessionModel) {
        _generation = State(initialValue: GenerationModel(api: api, session: session))
    }

    var body: some View {
        switch generation.phase {
        case .idle:
            CameraView(camera: camera, error: generation.errorMessage) { image in
                Task { await generation.generate(from: image) }
            }
        case .generating:
            GeneratingView()
        case .result(let result):
            ResultView(
                result: result,
                onSave: { image in Task { await PhotoSaver.saveToPhotos(image) } },
                onRetry: { generation.retry() },
                onDiscard: { generation.discard() }
            )
        }
    }
}
