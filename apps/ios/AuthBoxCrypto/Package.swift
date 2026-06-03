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
        // Audited libsecp256k1 (Bitcoin Core C library) for BIP-32 EC math +
        // future ECDSA signing. Pinned to the 0.21.x line: swift-tools 6.0,
        // exposes the raw `libsecp256k1` C product, no Swift-6.1 trait system.
        .package(url: "https://github.com/21-DOT-DEV/swift-secp256k1.git", .upToNextMinor(from: "0.21.0")),
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
            dependencies: [
                "BigInt",
                "CArgon2",
                .product(name: "libsecp256k1", package: "swift-secp256k1"),
            ],
            path: "Sources/AuthBoxCrypto"
        ),
        .testTarget(
            name: "AuthBoxCryptoTests",
            dependencies: ["AuthBoxCrypto"],
            path: "Tests/AuthBoxCryptoTests"
        ),
    ]
)
