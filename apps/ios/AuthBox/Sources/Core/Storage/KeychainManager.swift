import Foundation
import Security
import LocalAuthentication

/// Keychain wrapper for storing seed phrase and vault metadata.
/// Uses kSecClassGenericPassword with access control for biometric protection.
enum KeychainManager {

    private static let service = "com.authbox.vault"
    private static let seedAccount = "vault-seed"

    // MARK: - Seed Storage

    /// Check if a seed exists in Keychain.
    static func hasSeed() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: seedAccount,
            kSecReturnData as String: false,
        ]
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }

    /// Store seed in Keychain with biometric protection.
    static func storeSeed(_ seed: Data) throws {
        // Delete existing seed first
        deleteSeed()

        let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .biometryCurrentSet,
            nil
        )

        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: seedAccount,
            kSecValueData as String: seed,
        ]
        if let access {
            query[kSecAttrAccessControl as String] = access
        }

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw AuthBoxError.keychainError("Failed to store seed: \(status)")
        }
    }

    /// Retrieve seed from Keychain (requires biometric auth).
    static func retrieveSeed() throws -> Data {
        let context = LAContext()
        context.localizedReason = "Unlock your Auth Box vault"

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: seedAccount,
            kSecReturnData as String: true,
            kSecUseAuthenticationContext as String: context,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            throw AuthBoxError.keychainError("Failed to retrieve seed: \(status)")
        }

        return data
    }

    /// Delete seed from Keychain.
    @discardableResult
    static func deleteSeed() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: seedAccount,
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }
}
