import CArgon2
import Foundation

/// Argon2id password hashing + HKDF sub-key derivation.
///
/// Mirrors `@authbox/crypto` argon2.ts parameters exactly:
/// - Memory: 262144 KiB (256 MB)
/// - Iterations: 3
/// - Parallelism: 4
/// - Hash length: 32 bytes
/// - Salt: 32 bytes
public enum Argon2Config {
    public static let memoryKiB: UInt32 = 262144   // 256 MB
    public static let iterations: UInt32 = 3
    public static let parallelism: UInt32 = 4
    public static let hashLength: Int = 32
    public static let saltLength: Int = 32
}

/// Protocol for Argon2id implementations.
public protocol Argon2Provider: Sendable {
    func hash(password: Data, salt: Data) throws -> Data
}

/// Real Argon2id implementation using libargon2 C FFI.
///
/// This calls the actual Argon2id algorithm with the exact same parameters
/// as the TypeScript hash-wasm implementation, ensuring cross-platform
/// compatibility for the master password flow.
public struct NativeArgon2: Argon2Provider {
    public init() {}

    public func hash(password: Data, salt: Data) throws -> Data {
        var output = Data(count: Argon2Config.hashLength)

        let status = output.withUnsafeMutableBytes { outputPtr in
            password.withUnsafeBytes { passwordPtr in
                salt.withUnsafeBytes { saltPtr in
                    argon2id_hash_raw(
                        Argon2Config.iterations,
                        Argon2Config.memoryKiB,
                        Argon2Config.parallelism,
                        passwordPtr.baseAddress,
                        password.count,
                        saltPtr.baseAddress,
                        salt.count,
                        outputPtr.baseAddress,
                        Argon2Config.hashLength
                    )
                }
            }
        }

        guard status == ARGON2_OK.rawValue else {
            throw Argon2Error.derivationFailed
        }

        return output
    }
}

/// Derive three purpose-specific keys from a master password.
///
/// 1. Argon2id stretches the password into a 32-byte master key
/// 2. HKDF derives domain-separated sub-keys for auth, encryption, and MAC
public enum PasswordKeyDerivation {

    /// Default provider: real Argon2id via C FFI.
    nonisolated(unsafe) public static var provider: any Argon2Provider = NativeArgon2()

    public static func deriveKeys(password: String, salt: Data) throws -> DerivedKeys {
        let passwordData = Data(password.utf8)
        let masterKey = try provider.hash(password: passwordData, salt: salt)

        return DerivedKeys(
            authKey: HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .auth),
            encKey: HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .enc),
            macKey: HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .mac)
        )
    }

    /// Generate a cryptographically secure 32-byte salt.
    public static func generateSalt() -> Data {
        AES256GCM.generateRandomBytes(Argon2Config.saltLength)
    }
}

public enum Argon2Error: Error, Sendable {
    case derivationFailed
}
