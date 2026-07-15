// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FaceBackKit",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "FaceBackKit", targets: ["FaceBackKit"]),
    ],
    targets: [
        .target(name: "FaceBackKit"),
        .testTarget(name: "FaceBackKitTests", dependencies: ["FaceBackKit"]),
    ]
)
