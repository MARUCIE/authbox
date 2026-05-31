import Foundation
import Testing
@testable import AuthBoxCrypto

// MARK: - BIP-39 Mnemonic Tests

@Suite("BIP-39 Mnemonic")
struct MnemonicTests {

    @Test("generates 24-word mnemonic (256-bit entropy)")
    func generate24Words() {
        let mnemonic = Seed.generateMnemonic(strength: 256)
        let words = mnemonic.split(separator: " ")
        #expect(words.count == 24)
        for word in words {
            #expect(WordlistEN.words.contains(String(word)))
        }
    }

    @Test("generates 12-word mnemonic (128-bit entropy)")
    func generate12Words() {
        let mnemonic = Seed.generateMnemonic(strength: 128)
        let words = mnemonic.split(separator: " ")
        #expect(words.count == 12)
    }

    @Test("generates unique mnemonics each time")
    func uniqueMnemonics() {
        let a = Seed.generateMnemonic(strength: 256)
        let b = Seed.generateMnemonic(strength: 256)
        #expect(a != b)
    }

    @Test("validates correct mnemonic")
    func validateCorrect() {
        let mnemonic = Seed.generateMnemonic(strength: 256)
        #expect(Seed.validateMnemonic(mnemonic) == true)
    }

    @Test("rejects invalid word")
    func rejectInvalidWord() {
        let mnemonic = Seed.generateMnemonic(strength: 256)
        var words = mnemonic.split(separator: " ").map(String.init)
        words[0] = "invalidxyz"
        #expect(Seed.validateMnemonic(words.joined(separator: " ")) == false)
    }

    @Test("rejects wrong word count")
    func rejectWrongCount() {
        #expect(Seed.validateMnemonic("abandon abandon abandon") == false)
    }
}

// MARK: - Mnemonic to Seed Tests

@Suite("Mnemonic to Seed")
struct MnemonicToSeedTests {

    @Test("produces 64-byte seed")
    func seedLength() {
        let mnemonic = Seed.generateMnemonic(strength: 256)
        let seed = Seed.mnemonicToSeed(mnemonic)
        #expect(seed.count == 64)
    }

    @Test("is deterministic (same mnemonic = same seed)")
    func deterministic() {
        let mnemonic = Seed.generateMnemonic(strength: 256)
        let seed1 = Seed.mnemonicToSeed(mnemonic)
        let seed2 = Seed.mnemonicToSeed(mnemonic)
        #expect(seed1 == seed2)
    }

    @Test("different passphrase = different seed")
    func passphraseChanges() {
        let mnemonic = Seed.generateMnemonic(strength: 256)
        let seed1 = Seed.mnemonicToSeed(mnemonic, passphrase: "")
        let seed2 = Seed.mnemonicToSeed(mnemonic, passphrase: "mypassphrase")
        #expect(seed1 != seed2)
    }
}

// MARK: - HD Key Derivation Tests

@Suite("HD Key Derivation")
struct HDKeyDerivationTests {

    let seed: Data

    init() {
        let mnemonic = Seed.generateMnemonic(strength: 256)
        seed = Seed.mnemonicToSeed(mnemonic)
    }

    @Test("derives 32-byte vault key")
    func vaultKeyLength() {
        let key = Seed.deriveKey(seed: seed, purpose: .vault, index: 0)
        #expect(key.count == 32)
    }

    @Test("different purposes produce different keys")
    func differentPurposes() {
        let vaultKey = Seed.deriveKey(seed: seed, purpose: .vault, index: 0)
        let syncKey = Seed.deriveKey(seed: seed, purpose: .sync, index: 0)
        let agentKey = Seed.deriveKey(seed: seed, purpose: .agent, index: 0)
        let authKey = Seed.deriveKey(seed: seed, purpose: .auth, index: 0)

        let keys: Set<Data> = [vaultKey, syncKey, agentKey, authKey]
        #expect(keys.count == 4)
    }

    @Test("different indices produce different agent keys")
    func differentIndices() {
        let agent0 = Seed.deriveAgentKey(seed: seed, agentIndex: 0)
        let agent1 = Seed.deriveAgentKey(seed: seed, agentIndex: 1)
        let agent2 = Seed.deriveAgentKey(seed: seed, agentIndex: 2)

        let keys: Set<Data> = [agent0, agent1, agent2]
        #expect(keys.count == 3)
    }

    @Test("is deterministic (same seed + path = same key)")
    func deterministic() {
        let key1 = Seed.deriveKey(seed: seed, purpose: .vault, index: 0)
        let key2 = Seed.deriveKey(seed: seed, purpose: .vault, index: 0)
        #expect(key1 == key2)
    }

    @Test("deriveAllKeys returns four 32-byte keys")
    func allKeys() {
        let bundle = Seed.deriveAllKeys(seed: seed)
        #expect(bundle.vaultKey.count == 32)
        #expect(bundle.syncKey.count == 32)
        #expect(bundle.authKey.count == 32)
        #expect(bundle.agentRootKey.count == 32)
    }
}

// MARK: - Deterministic Password Derivation Tests

@Suite("Deterministic Password Derivation")
struct DerivePasswordTests {

    let seed: Data

    init() {
        let mnemonic = Seed.generateMnemonic(strength: 256)
        seed = Seed.mnemonicToSeed(mnemonic)
    }

    @Test("derives a password of specified length")
    func passwordLength() {
        let password = Seed.derivePassword(seed: seed, site: "github.com",
            options: DerivePasswordOptions(length: 20))
        #expect(password.count == 20)
    }

    @Test("is deterministic (same seed + site = same password)")
    func deterministic() {
        let pw1 = Seed.derivePassword(seed: seed, site: "github.com")
        let pw2 = Seed.derivePassword(seed: seed, site: "github.com")
        #expect(pw1 == pw2)
    }

    @Test("different sites produce different passwords")
    func differentSites() {
        let pw1 = Seed.derivePassword(seed: seed, site: "github.com")
        let pw2 = Seed.derivePassword(seed: seed, site: "google.com")
        let pw3 = Seed.derivePassword(seed: seed, site: "stripe.com")
        let passwords: Set<String> = [pw1, pw2, pw3]
        #expect(passwords.count == 3)
    }

    @Test("counter increment produces different password")
    func counterIncrement() {
        let pw0 = Seed.derivePassword(seed: seed, site: "github.com",
            options: DerivePasswordOptions(counter: 0))
        let pw1 = Seed.derivePassword(seed: seed, site: "github.com",
            options: DerivePasswordOptions(counter: 1))
        #expect(pw0 != pw1)
    }

    @Test("respects character class options")
    func characterClasses() {
        let pw = Seed.derivePassword(seed: seed, site: "test.com",
            options: DerivePasswordOptions(
                length: 30,
                lowercase: true,
                uppercase: false,
                digits: false,
                symbols: false
            ))
        let validChars = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz")
        for scalar in pw.unicodeScalars {
            #expect(validChars.contains(scalar))
        }
    }

    @Test("site name is case-insensitive")
    func caseInsensitive() {
        let pw1 = Seed.derivePassword(seed: seed, site: "GitHub.com")
        let pw2 = Seed.derivePassword(seed: seed, site: "github.com")
        #expect(pw1 == pw2)
    }
}
