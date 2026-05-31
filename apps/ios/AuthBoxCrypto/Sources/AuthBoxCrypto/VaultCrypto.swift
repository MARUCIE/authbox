import Foundation

/// Vault encryption operations.
///
/// Mirrors `@authbox/crypto` vault-crypto.ts:
/// - Random 32-byte vault key
/// - Vault key wrapped with user's encKey (AES-256-GCM)
/// - Per-item encryption with vault key
public enum VaultCrypto {

    private static let vaultKeyLength = 32

    /// Generate a random 32-byte vault key.
    public static func generateVaultKey() -> Data {
        AES256GCM.generateRandomBytes(vaultKeyLength)
    }

    /// Encrypt the vault key using the user's encryption key.
    /// Stored on the server; only decryptable with the user's encKey.
    public static func encryptVaultKey(encKey: Data, vaultKey: Data) throws -> VaultKeyBundle {
        let payload = try AES256GCM.encrypt(key: encKey, plaintext: vaultKey)
        return VaultKeyBundle(
            encryptedVaultKey: payload.ciphertext,
            nonce: payload.nonce,
            tag: payload.tag
        )
    }

    /// Decrypt the vault key using the user's encryption key.
    public static func decryptVaultKey(encKey: Data, bundle: VaultKeyBundle) throws -> Data {
        try AES256GCM.decrypt(
            key: encKey,
            payload: EncryptedPayload(
                ciphertext: bundle.encryptedVaultKey,
                nonce: bundle.nonce,
                tag: bundle.tag
            )
        )
    }

    /// Encrypt a vault item (JSON string) with the vault key.
    public static func encryptVaultItem(vaultKey: Data, plaintext: String) throws -> EncryptedPayload {
        try AES256GCM.encrypt(key: vaultKey, plaintext: Data(plaintext.utf8))
    }

    /// Decrypt a vault item back to its JSON string.
    public static func decryptVaultItem(vaultKey: Data, payload: EncryptedPayload) throws -> String {
        let data = try AES256GCM.decrypt(key: vaultKey, payload: payload)
        guard let text = String(data: data, encoding: .utf8) else {
            throw VaultCryptoError.invalidUTF8
        }
        return text
    }
}

public enum VaultCryptoError: Error, Sendable {
    case invalidUTF8
}
