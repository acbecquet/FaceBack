import UIKit
import FaceBackKit

/// Downscale + JPEG encode for upload, decode for display, and horizontal
/// mirroring for front-camera captures. Uses the platform-free `ImageMath` for
/// the target size. Mirrors `web/src/units/imageUtil.ts`.
enum ImageEncoder {
    static func encodeForUpload(_ image: UIImage) -> ImagePayload? {
        guard let cgImage = image.cgImage else { return nil }
        let target = ImageMath.scaledSize(width: cgImage.width, height: cgImage.height)

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: target.width, height: target.height),
            format: format
        )
        let resized = renderer.image { _ in
            image.draw(in: CGRect(x: 0, y: 0, width: target.width, height: target.height))
        }
        guard let data = resized.jpegData(compressionQuality: 0.9) else { return nil }
        return ImagePayload(base64: data.base64EncodedString(), mimeType: "image/jpeg")
    }

    static func image(from payload: ImagePayload) -> UIImage? {
        Data(base64Encoded: payload.base64).flatMap(UIImage.init(data:))
    }

    static func mirrored(_ image: UIImage) -> UIImage {
        guard let cgImage = image.cgImage else { return image }
        return UIImage(cgImage: cgImage, scale: image.scale, orientation: .upMirrored)
    }
}
