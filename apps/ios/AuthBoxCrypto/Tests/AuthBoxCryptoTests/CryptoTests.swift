import Foundation
import Testing
@testable import AuthBoxCrypto

// MARK: - HKDF Tests

@Suite("HKDF deriveSubKey")
struct HKDFTests {

    let masterKey = AES256GCM.generateRandomBytes(32)

    @Test("produces 32-byte output")
    func outputLength() {
        let key = HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .auth)
        #expect(key.count == 32)
    }

    @Test("produces deterministic output for same inputs")
    func deterministic() {
        let a = HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .enc)
        let b = HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .enc)
        #expect(a == b)
    }

    @Test("produces different keys for different purposes")
    func differentPurposes() {
        let authKey = HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .auth)
        let encKey = HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .enc)
        let macKey = HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .mac)
        #expect(authKey != encKey)
        #expect(encKey != macKey)
        #expect(authKey != macKey)
    }

    @Test("produces different keys for different info strings")
    func differentInfo() {
        let a = HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .auth, info: "context-1")
        let b = HKDFDerivation.deriveSubKey(masterKey: masterKey, purpose: .auth, info: "context-2")
        #expect(a != b)
    }
}

// MARK: - AES-256-GCM Tests

@Suite("AES-256-GCM")
struct AESTests {

    let key = AES256GCM.generateRandomBytes(32)
    let plaintext = Data("hello world".utf8)

    @Test("round-trip: encrypt then decrypt returns original")
    func roundTrip() throws {
        let encrypted = try AES256GCM.encrypt(key: key, plaintext: plaintext)
        let decrypted = try AES256GCM.decrypt(key: key, payload: encrypted)
        #expect(decrypted == plaintext)
    }

    @Test("nonce is 12 bytes, tag is 16 bytes")
    func nonceAndTagSizes() throws {
        let encrypted = try AES256GCM.encrypt(key: key, plaintext: plaintext)
        #expect(encrypted.nonce.count == 12)
        #expect(encrypted.tag.count == 16)
    }

    @Test("different nonces produce different ciphertexts")
    func uniqueNonces() throws {
        let a = try AES256GCM.encrypt(key: key, plaintext: plaintext)
        let b = try AES256GCM.encrypt(key: key, plaintext: plaintext)
        #expect(a.nonce != b.nonce)
        #expect(a.ciphertext != b.ciphertext)
    }

    @Test("wrong key fails to decrypt")
    func wrongKey() throws {
        let wrongKey = AES256GCM.generateRandomBytes(32)
        let encrypted = try AES256GCM.encrypt(key: key, plaintext: plaintext)
        do {
            _ = try AES256GCM.decrypt(key: wrongKey, payload: encrypted)
            Issue.record("Expected decryption to fail with wrong key")
        } catch {
            // Expected
        }
    }

    @Test("tampered ciphertext fails to decrypt")
    func tamperedCiphertext() throws {
        let localKey = AES256GCM.generateRandomBytes(32)
        let localPlaintext = Data("test message".utf8)
        let encrypted = try AES256GCM.encrypt(key: localKey, plaintext: localPlaintext)
        var tamperedBytes = Array(encrypted.ciphertext)
        tamperedBytes[0] = tamperedBytes[0] ^ 0xFF
        let tamperedPayload = EncryptedPayload(
            ciphertext: Data(tamperedBytes),
            nonce: encrypted.nonce,
            tag: encrypted.tag
        )
        var didThrow = false
        do {
            _ = try AES256GCM.decrypt(key: localKey, payload: tamperedPayload)
        } catch {
            didThrow = true
        }
        #expect(didThrow, "Tampered ciphertext should fail decryption")
    }

    @Test("supports additional authenticated data")
    func additionalData() throws {
        let aad = Data("metadata".utf8)
        let encrypted = try AES256GCM.encrypt(key: key, plaintext: plaintext, additionalData: aad)
        // Correct AAD succeeds
        let decrypted = try AES256GCM.decrypt(key: key, payload: encrypted, additionalData: aad)
        #expect(decrypted == plaintext)
        // Wrong AAD fails
        let wrongAad = Data("wrong".utf8)
        do {
            _ = try AES256GCM.decrypt(key: key, payload: encrypted, additionalData: wrongAad)
            Issue.record("Expected decryption to fail with wrong AAD")
        } catch {
            // Expected
        }
    }

    @Test("handles empty plaintext")
    func emptyPlaintext() throws {
        let empty = Data()
        let encrypted = try AES256GCM.encrypt(key: key, plaintext: empty)
        let decrypted = try AES256GCM.decrypt(key: key, payload: encrypted)
        #expect(decrypted == empty)
    }
}

// MARK: - SRP Tests

@Suite("SRP-6a")
struct SRPTests {

    let email = "test@example.com"
    let password = "correct-horse-battery-staple"
    let salt = AES256GCM.generateRandomBytes(32)

    @Test("verifier generation is deterministic for same inputs")
    func deterministicVerifier() {
        let a = SRP.generateVerifier(email: email, password: password, salt: salt)
        let b = SRP.generateVerifier(email: email, password: password, salt: salt)
        #expect(a.verifier == b.verifier)
    }

    @Test("verifier is 256 bytes (2048-bit group)")
    func verifierLength() {
        let result = SRP.generateVerifier(email: email, password: password, salt: salt)
        #expect(result.verifier.count == 256)
    }

    @Test("different passwords produce different verifiers")
    func differentPasswords() {
        let a = SRP.generateVerifier(email: email, password: "password-a", salt: salt)
        let b = SRP.generateVerifier(email: email, password: "password-b", salt: salt)
        #expect(a.verifier != b.verifier)
    }

    @Test("client init produces valid ephemeral pair")
    func clientInit() {
        let state = SRP.clientInit()
        #expect(state.ephemeralSecret.count == 32)
        #expect(state.ephemeralPublic.count == 256)
        // A should not be all zeros
        #expect(state.ephemeralPublic.contains(where: { $0 != 0 }))
    }

    @Test("client verify rejects B = 0")
    func rejectZeroB() {
        let state = SRP.clientInit()
        let zeroB = Data(count: 256) // all zeros
        do {
            _ = try SRP.clientVerify(
                state: state,
                email: email,
                password: password,
                salt: salt,
                serverPublicB: zeroB
            )
            Issue.record("Expected SRP to reject B = 0")
        } catch {
            // Expected: SRPError.invalidServerPublicKey
        }
    }
}

// MARK: - Vault Crypto Tests

@Suite("Vault Key Operations")
struct VaultKeyTests {

    @Test("generateVaultKey produces 32 random bytes")
    func vaultKeyLength() {
        let key = VaultCrypto.generateVaultKey()
        #expect(key.count == 32)
        let key2 = VaultCrypto.generateVaultKey()
        #expect(key != key2)
    }

    @Test("vault key encrypt/decrypt round-trip")
    func vaultKeyRoundTrip() throws {
        let encKey = AES256GCM.generateRandomBytes(32)
        let vaultKey = VaultCrypto.generateVaultKey()

        let bundle = try VaultCrypto.encryptVaultKey(encKey: encKey, vaultKey: vaultKey)
        let recovered = try VaultCrypto.decryptVaultKey(encKey: encKey, bundle: bundle)
        #expect(recovered == vaultKey)
    }

    @Test("wrong encKey fails to decrypt vault key")
    func wrongEncKey() throws {
        let encKey = AES256GCM.generateRandomBytes(32)
        let wrongKey = AES256GCM.generateRandomBytes(32)
        let vaultKey = VaultCrypto.generateVaultKey()

        let bundle = try VaultCrypto.encryptVaultKey(encKey: encKey, vaultKey: vaultKey)
        do {
            _ = try VaultCrypto.decryptVaultKey(encKey: wrongKey, bundle: bundle)
            Issue.record("Expected decryption to fail with wrong encKey")
        } catch {
            // Expected
        }
    }
}

@Suite("Vault Item Operations")
struct VaultItemTests {

    let vaultKey = AES256GCM.generateRandomBytes(32)

    @Test("encrypt/decrypt round-trip with JSON data")
    func jsonRoundTrip() throws {
        let item = """
        {"title":"GitHub","username":"user@example.com","password":"s3cret!","url":"https://github.com"}
        """
        let encrypted = try VaultCrypto.encryptVaultItem(vaultKey: vaultKey, plaintext: item)
        let decrypted = try VaultCrypto.decryptVaultItem(vaultKey: vaultKey, payload: encrypted)
        #expect(decrypted == item)
    }

    @Test("encrypt/decrypt round-trip with unicode content")
    func unicodeRoundTrip() throws {
        let item = #"{"note":"Password manager"}"#
        let encrypted = try VaultCrypto.encryptVaultItem(vaultKey: vaultKey, plaintext: item)
        let decrypted = try VaultCrypto.decryptVaultItem(vaultKey: vaultKey, payload: encrypted)
        #expect(decrypted == item)
    }

    @Test("different items produce different ciphertexts")
    func differentCiphertexts() throws {
        let a = try VaultCrypto.encryptVaultItem(vaultKey: vaultKey, plaintext: #"{"a":1}"#)
        let b = try VaultCrypto.encryptVaultItem(vaultKey: vaultKey, plaintext: #"{"b":2}"#)
        #expect(a.ciphertext != b.ciphertext)
    }
}
