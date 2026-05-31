import CryptoKit
import Foundation

/// HKDF-SHA256 sub-key derivation.
///
/// Mirrors `@authbox/crypto` hkdf.ts:
/// - Purpose string used as HKDF salt (domain separation)
/// - Optional info parameter
/// - 32-byte output
public enum HKDFDerivation {

    /// Derive a purpose-specific 32-byte sub-key from a master key.
    ///
    /// The purpose string ensures domain separation between auth/enc/mac keys
    /// even when derived from the same master key.
    ///
    /// - Parameters:
    ///   - masterKey: Input key material
    ///   - purpose: Domain separation purpose (auth/enc/mac)
    ///   - info: Optional additional context
    /// - Returns: 32-byte derived sub-key
    public static func deriveSubKey(
        masterKey: Data,
        purpose: SubKeyPurpose,
        info: String? = nil
    ) -> Data {
        let inputKey = SymmetricKey(data: masterKey)
        let salt = Data(purpose.rawValue.utf8)
        let infoData = info.map { Data($0.utf8) } ?? Data()

        let derivedKey = CryptoKit.HKDF<SHA256>.deriveKey(
            inputKeyMaterial: inputKey,
            salt: salt,
            info: infoData,
            outputByteCount: 32
        )

        return derivedKey.withUnsafeBytes { Data($0) }
    }
}
