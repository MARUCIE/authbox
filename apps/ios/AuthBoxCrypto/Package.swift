// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AuthBoxCrypto",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "AuthBoxCrypto", targets: ["AuthBoxCrypto"]),
    ],
    dependencies: [
        .package(url: "https://github.com/attaswift/BigInt.git", from: "5.4.1"),
    ],
    targets: [
        // Embedded argon2 reference implementation (no system dependency)
        .target(
            name: "CArgon2",
            path: "Sources/CArgon2",
            publicHeadersPath: "include",
            cSettings: [
                .define("ARGON2_NO_THREADS", to: "1"),  // iOS-safe: no pthread dependency
            ]
        ),
        .target(
            name: "AuthBoxCrypto",
            dependencies: ["BigInt", "CArgon2"],
            path: "Sources/AuthBoxCrypto"
        ),
        .testTarget(
            name: "AuthBoxCryptoTests",
            dependencies: ["AuthBoxCrypto"],
            path: "Tests/AuthBoxCryptoTests"
        ),
    ]
)
