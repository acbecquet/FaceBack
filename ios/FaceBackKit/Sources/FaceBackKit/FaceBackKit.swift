/// Namespace anchor for the platform-free FaceBack logic package.
///
/// Real types (models, APIClient, UsageGuard, image math, GenerationFlow) are
/// added in Phase 2. This package builds and tests on Linux, which is what
/// gives us a fast, free feedback loop outside the macOS runner.
public enum FaceBackKit {
    public static let version = "0.1.0"
}
