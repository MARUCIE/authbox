import CryptoKit
import Foundation

/// AES-256-GCM encryption/decryption using Apple CryptoKit.
///
/// Mirrors `@authbox/crypto` aes-gcm.ts exactly:
/// - 12-byte random nonce
/// - 16-byte GCM authentication tag
/// - Separated (ciphertext, nonce, tag) tuple output
public enum AES256GCM {

    /// Encrypt plaintext with AES-256-GCM.
    ///
    /// - Parameters:
    ///   - key: 32-byte encryption key
    ///   - plaintext: Data to encrypt
    ///   - additionalData: Optional AAD for authenticated encryption
    /// - Returns: EncryptedPayload with separated ciphertext, nonce, and tag
    public static func encrypt(
        key: Data,
        plaintext: Data,
        additionalData: Data? = nil
    ) throws -> EncryptedPayload {
        let symmetricKey = SymmetricKey(data: key)
        let nonce = AES.GCM.Nonce()

        let sealedBox: AES.GCM.SealedBox
        if let aad = additionalData {
            sealedBox = try AES.GCM.seal(
                plaintext,
                using: symmetricKey,
                nonce: nonce,
                authenticating: aad
            )
        } else {
            sealedBox = try AES.GCM.seal(
                plaintext,
                using: symmetricKey,
                nonce: nonce
            )
        }

        return EncryptedPayload(
            ciphertext: sealedBox.ciphertext,
            nonce: Data(sealedBox.nonce),
            tag: sealedBox.tag
        )
    }

    /// Decrypt an AES-256-GCM payload.
    ///
    /// - Parameters:
    ///   - key: 32-byte encryption key
    ///   - payload: EncryptedPayload with ciphertext, nonce, and tag
    ///   - additionalData: Optional AAD (must match what was used during encryption)
    /// - Returns: Decrypted plaintext
    /// - Throws: CryptoKit error on authentication failure
    public static func decrypt(
        key: Data,
        payload: EncryptedPayload,
        additionalData: Data? = nil
    ) throws -> Data {
        let symmetricKey = SymmetricKey(data: key)
        let nonce = try AES.GCM.Nonce(data: payload.nonce)

        let sealedBox = try AES.GCM.SealedBox(
            nonce: nonce,
            ciphertext: payload.ciphertext,
            tag: payload.tag
        )

        if let aad = additionalData {
            return try Data(AES.GCM.open(sealedBox, using: symmetricKey, authenticating: aad))
        } else {
            return try Data(AES.GCM.open(sealedBox, using: symmetricKey))
        }
    }

    /// Generate cryptographically secure random bytes.
    public static func generateRandomBytes(_ count: Int) -> Data {
        var bytes = Data(count: count)
        bytes.withUnsafeMutableBytes { ptr in
            _ = SecRandomCopyBytes(kSecRandomDefault, count, ptr.baseAddress!)
        }
        return bytes
    }
}
