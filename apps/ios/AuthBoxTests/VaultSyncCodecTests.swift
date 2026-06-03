import XCTest
@testable import AuthBox
import AuthBoxCrypto

/// Proves the zero-knowledge sync codec (`VaultStore.encryptForSync` /
/// `decryptFromSync`) — the cryptographic foundation iCloud sync will ride on.
///
/// The product's whole security claim is "only ciphertext leaves the device,"
/// so these tests assert two things the eventual CloudKit transport depends on:
/// (1) a full round-trip preserves every field, including the 2FA `otpauth`
/// secret; (2) the encrypted blob contains none of the plaintext. The CloudKit
/// transport itself is entitlement/device-gated (see ICLOUD_SYNC_ARCHITECTURE.md)
/// — this proves the part that is verifiable without an iCloud container.
@MainActor
final class VaultSyncCodecTests: XCTestCase {

    private func sampleItem() -> VaultItem {
        VaultItem(
            title: "GitHub",
            username: "alice@acme.com",
            password: "S3cr3t-P@ss!",
            uri: "https://github.com",
            notes: "recovery codes in the drawer",
            category: .login,
            isFavorite: true,
            otpauth: "otpauth://totp/GitHub:alice@acme.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub"
        )
    }

    func testSyncRoundTripPreservesEveryField() throws {
        let key = VaultCrypto.generateVaultKey()
        let original = sampleItem()

        let blob = try VaultStore.encryptForSync(item: original, vaultKey: key)
        let restored = try VaultStore.decryptFromSync(
            encryptedData: blob.encryptedData, nonce: blob.nonce, tag: blob.tag,
            vaultKey: key, serverID: "rec-1"
        )

        XCTAssertEqual(restored.title, original.title)
        XCTAssertEqual(restored.username, original.username)
        XCTAssertEqual(restored.password, original.password)
        XCTAssertEqual(restored.uri, original.uri)
        XCTAssertEqual(restored.notes, original.notes)
        XCTAssertEqual(restored.category, original.category)
        XCTAssertEqual(restored.isFavorite, original.isFavorite)
        XCTAssertEqual(restored.otpauth, original.otpauth,
                       "The 2FA secret must survive sync — otherwise imported authenticators vanish on another device")
    }

    /// Zero-knowledge: the blob that would be uploaded must contain no plaintext.
    func testEncryptedBlobLeaksNoPlaintext() throws {
        let key = VaultCrypto.generateVaultKey()
        let blob = try VaultStore.encryptForSync(item: sampleItem(), vaultKey: key)

        let cipherBytes = Data(base64Encoded: blob.encryptedData)!
        for secret in ["S3cr3t-P@ss!", "GEZDGNBVGY3TQOJQ", "alice@acme.com", "recovery codes"] {
            XCTAssertFalse(cipherBytes.range(of: Data(secret.utf8)) != nil,
                           "Ciphertext must not contain the plaintext substring \"\(secret)\"")
        }
    }

    /// AES-GCM uses a fresh random nonce each time, so the same item encrypts to
    /// different bytes — no deterministic equality leak across uploads.
    func testEncryptionIsNonDeterministic() throws {
        let key = VaultCrypto.generateVaultKey()
        let item = sampleItem()
        let a = try VaultStore.encryptForSync(item: item, vaultKey: key)
        let b = try VaultStore.encryptForSync(item: item, vaultKey: key)
        XCTAssertNotEqual(a.nonce, b.nonce)
        XCTAssertNotEqual(a.encryptedData, b.encryptedData)
    }

    /// The blob is bound to the vault key: a different key (a device that never
    /// had the seed) cannot decrypt it — GCM tag verification fails.
    func testWrongKeyCannotDecrypt() throws {
        let key = VaultCrypto.generateVaultKey()
        let wrongKey = VaultCrypto.generateVaultKey()
        let blob = try VaultStore.encryptForSync(item: sampleItem(), vaultKey: key)

        XCTAssertThrowsError(
            try VaultStore.decryptFromSync(
                encryptedData: blob.encryptedData, nonce: blob.nonce, tag: blob.tag,
                vaultKey: wrongKey, serverID: "rec-1"
            ),
            "Decrypting with the wrong vault key must fail, not return garbage"
        )
    }
}
