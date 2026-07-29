// swift-tools-version: 6.0
import PackageDescription

// RouseCore is deliberately platform-agnostic: no AVFoundation, no UIKit, no CryptoKit.
// That keeps the whole engine buildable and testable from the command line before Xcode
// is installed, and keeps the app target a thin shell around tested logic.
let package = Package(
    name: "RouseCore",
    platforms: [.macOS(.v13), .iOS(.v17)],
    products: [
        .library(name: "RouseCore", targets: ["RouseCore"]),
        .executable(name: "rouse-render", targets: ["rouse-render"]),
    ],
    targets: [
        .target(name: "RouseCore"),
        .executableTarget(name: "rouse-render", dependencies: ["RouseCore"]),
        .testTarget(name: "RouseCoreTests", dependencies: ["RouseCore"]),
    ]
)
