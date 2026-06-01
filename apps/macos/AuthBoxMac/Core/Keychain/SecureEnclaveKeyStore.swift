//
//  SecureEnclaveKeyStore.swift
//  P1 — wraps the vault master key with a Secure-Enclave-resident EC P-256 key.
//
//  Mechanism (ADR-004): the SE private key carries access control
//  [.privateKeyUsage, .biometryCurrentSet], so DECRYPTION triggers Touch ID and
//  is invalidated if the enrolled fingerprint set changes (anti-coercion). The
//  public key encrypts the master key with no authentication.
//
//  The Secure Enclave never exports the private key; only ciphertext + the
//  wrapped master key ever touch disk.
//

import Foundation
import Security
import LocalAuthentication

enum KeychainError: Error, Equatable {
    case enclaveUnavailable
    case keyCreationFailed(String)
    case wrapFailed(String)
    case unwrapFailed(String)
    case notProvisioned
}

/// Seam: vault session depends on this, not on Security directly.
protocol VaultKeyWrapping: Sendable {
    /// Wrap (encrypt) the master key with the SE public key. No auth required.
    func wrap(masterKey: Data) throws -> Data
    /// Unwrap (decrypt) with the SE private key — triggers Touch ID. Async.
    func unwrap(wrapped: Data, reason: String) async throws -> Data
    /// Whether a Secure Enclave key has been provisioned for this app.
    func isProvisioned() -> Bool
    /// Create the SE key (idempotent). Call once at vault setup.
    func provisionIfNeeded() throws
}

struct SecureEnclaveKeyStore: VaultKeyWrapping {
    private let tag: Data
    private let algorithm: SecKeyAlgorithm = .eciesEncryptionCofactorVariableIVX963SHA256AESGCM

    init(tag: String = "com.authbox.mac.vault-wrap-key") {
        self.tag = Data(tag.utf8)
    }

    func isProvisioned() -> Bool {
        (try? loadPrivateKey()) != nil
    }

    func provisionIfNeeded() throws {
        if isProvisioned() { return }
        _ = try createPrivateKey()
    }

    func wrap(masterKey: Data) throws -> Data {
        let priv = try (loadPrivateKey() ?? createPrivateKey())
        guard let pub = SecKeyCopyPublicKey(priv) else {
            throw KeychainError.wrapFailed("no public key")
        }
        guard SecKeyIsAlgorithmSupported(pub, .encrypt, algorithm) else {
            throw KeychainError.wrapFailed("algorithm unsupported")
        }
        var err: Unmanaged<CFError>?
        guard let cipher = SecKeyCreateEncryptedData(pub, algorithm, masterKey as CFData, &err) else {
            throw KeychainError.wrapFailed(Self.describe(err))
        }
        return cipher as Data
    }

    func unwrap(wrapped: Data, reason: String) async throws -> Data {
        guard let priv = try loadPrivateKey() else { throw KeychainError.notProvisioned }
        // The LAContext attached to the decrypt op surfaces the Touch ID prompt.
        let ctx = LAContext()
        ctx.localizedReason = reason
        guard SecKeyIsAlgorithmSupported(priv, .decrypt, algorithm) else {
            throw KeychainError.unwrapFailed("algorithm unsupported")
        }
        // SecKeyCreateDecryptedData blocks on the biometric prompt; run off the main actor.
        return try await Task.detached(priority: .userInitiated) {
            var err: Unmanaged<CFError>?
            guard let plain = SecKeyCreateDecryptedData(priv, self.algorithm, wrapped as CFData, &err) else {
                throw KeychainError.unwrapFailed(Self.describe(err))
            }
            return plain as Data
        }.value
    }

    // MARK: - SE key lifecycle

    private func createPrivateKey() throws -> SecKey {
        var acError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            &acError
        ) else {
            throw KeychainError.keyCreationFailed(Self.describe(acError))
        }

        let attrs: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                kSecAttrAccessControl as String: access,
            ],
        ]

        var err: Unmanaged<CFError>?
        guard let key = SecKeyCreateRandomKey(attrs as CFDictionary, &err) else {
            throw KeychainError.keyCreationFailed(Self.describe(err))
        }
        return key
    }

    private func loadPrivateKey() throws -> SecKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            return (item as! SecKey)
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.keyCreationFailed("SecItemCopyMatching status \(status)")
        }
    }

    private static func describe(_ err: Unmanaged<CFError>?) -> String {
        guard let e = err?.takeRetainedValue() else { return "unknown" }
        return CFErrorCopyDescription(e) as String? ?? "unknown"
    }
}
