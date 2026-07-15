import Foundation

/// Pure sizing math for the upload downscale. The actual pixel resampling is
/// done in the app target with CoreGraphics; this is the platform-free part,
/// mirroring `computeScaledSize` in `web/src/units/imageUtil.ts`.
public enum ImageMath {
    /// Longest-edge target for uploaded images (web `MAX_IMAGE_EDGE`).
    public static let maxEdge = 1024

    /// Returns the size scaled so the longest edge is at most `maxEdge`,
    /// preserving aspect ratio. Images already within the limit are unchanged.
    public static func scaledSize(width: Int, height: Int, maxEdge: Int = ImageMath.maxEdge) -> (width: Int, height: Int) {
        let longest = max(width, height)
        guard longest > maxEdge, longest > 0 else { return (width, height) }
        let scale = Double(maxEdge) / Double(longest)
        return (width: Int((Double(width) * scale).rounded()),
                height: Int((Double(height) * scale).rounded()))
    }
}
