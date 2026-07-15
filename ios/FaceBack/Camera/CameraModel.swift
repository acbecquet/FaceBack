import AVFoundation
import UIKit
import Observation

enum CameraError: Error { case unavailable, noImage }

/// AVFoundation capture. Live capture only works on a device (the Simulator has
/// no camera, so `available` stays false there and the UI leans on the photo
/// picker). Mirrors `web/src/units/camera.ts` + the Camera screen: the front
/// camera's captured frame is flipped to match its mirrored preview.
@MainActor
@Observable
final class CameraModel: NSObject {
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private(set) var facing: AVCaptureDevice.Position = .back
    private(set) var available = false

    @ObservationIgnored private var captureContinuation: CheckedContinuation<UIImage, Error>?

    nonisolated override init() { super.init() }

    func start() async {
        guard await Self.requestAccess() else {
            available = false
            return
        }
        configure()
        startSession()
    }

    func stop() {
        if session.isRunning { session.stopRunning() }
    }

    func flip() {
        facing = (facing == .back) ? .front : .back
        configure()
    }

    func capture() async throws -> UIImage {
        guard available else { throw CameraError.unavailable }
        return try await withCheckedThrowingContinuation { continuation in
            captureContinuation = continuation
            output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
        }
    }

    private static func requestAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video)
        default: return false
        }
    }

    private func configure() {
        session.beginConfiguration()
        for input in session.inputs { session.removeInput(input) }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: facing),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            available = false
            session.commitConfiguration()
            return
        }
        session.addInput(input)
        if !session.outputs.contains(output), session.canAddOutput(output) {
            session.addOutput(output)
        }
        session.commitConfiguration()
        available = true
    }

    private func startSession() {
        guard !session.isRunning else { return }
        let session = self.session
        Task.detached { session.startRunning() }
    }
}

extension CameraModel: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        let data = photo.fileDataRepresentation()
        Task { @MainActor in
            defer { captureContinuation = nil }
            if let error {
                captureContinuation?.resume(throwing: error)
                return
            }
            guard let data, let image = UIImage(data: data) else {
                captureContinuation?.resume(throwing: CameraError.noImage)
                return
            }
            let finalImage = (facing == .front) ? ImageEncoder.mirrored(image) : image
            captureContinuation?.resume(returning: finalImage)
        }
    }
}
