import SwiftUI

/// The capture screen. Faithful port of `web/src/ui/screens/Camera.tsx` (the
/// polished, deployed version with the front-mirror rule). Settings gear is
/// hidden in the MVP.
struct CameraView: View {
    let camera: CameraModel
    let error: String?
    let onCaptured: (UIImage) -> Void

    @State private var showPicker = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Wordmark(size: 17)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Theme.bg)

            if let error, !error.isEmpty {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.errorRed)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
                    .background(Theme.bg)
            }

            ZStack {
                Color(hex: 0x14161A)
                if camera.available {
                    CameraPreview(session: camera.session, mirrored: camera.facing == .front)
                }
                VStack {
                    Text(overlayHint)
                        .font(.system(size: 12))
                        .foregroundStyle(.white)
                        .padding(.top, 10)
                    Spacer()
                    HStack {
                        Button { showPicker = true } label: {
                            Image(systemName: "photo").font(.system(size: 22)).foregroundStyle(.white)
                        }
                        .accessibilityLabel("Upload photo")
                        Spacer()
                        Button { Task { await shoot() } } label: {
                            Circle()
                                .fill(.white)
                                .frame(width: 64, height: 64)
                                .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 4))
                        }
                        .accessibilityLabel("Shutter")
                        .disabled(!camera.available)
                        .opacity(camera.available ? 1 : 0.4)
                        Spacer()
                        Button { camera.flip() } label: {
                            Image(systemName: "arrow.triangle.2.circlepath.camera").font(.system(size: 22)).foregroundStyle(.white)
                        }
                        .accessibilityLabel("Switch camera")
                        .disabled(!camera.available)
                        .opacity(camera.available ? 1 : 0.4)
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 18)
                }
            }
        }
        .task { await camera.start() }
        .onDisappear { camera.stop() }
        .sheet(isPresented: $showPicker) {
            PhotoPicker { image in
                showPicker = false
                onCaptured(image)
            }
        }
    }

    private var overlayHint: String {
        if !camera.available { return "Camera unavailable. You can upload a photo instead." }
        return camera.facing == .front ? "Front camera - tap switch for back" : "Back camera - tap switch for front"
    }

    private func shoot() async {
        guard camera.available else { return }
        do {
            onCaptured(try await camera.capture())
        } catch {
            // Capture failed; remain on the camera.
        }
    }
}
