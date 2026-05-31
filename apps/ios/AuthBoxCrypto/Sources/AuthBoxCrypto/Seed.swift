import CryptoKit
import Foundation

/// BIP-39 mnemonic generation + HD key derivation for Auth Box.
///
/// Mirrors `@authbox/crypto` seed.ts exactly. All constants and algorithms
/// are identical to ensure cross-platform seed recovery compatibility.
///
/// Derivation path: m / ABX' / purpose' / index'
/// Master key HMAC domain: "authbox seed"
public enum Seed {

    // MARK: - Constants (must match TypeScript exactly)

    private static let hardenedOffset: UInt32 = 0x80000000
    private static let authBoxPurpose: UInt32 = 0x41425800  // "ABX\0" as uint32

    private static let passwordCharsLower   = "abcdefghijklmnopqrstuvwxyz"
    private static let passwordCharsUpper   = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    private static let passwordCharsDigits  = "0123456789"
    private static let passwordCharsSymbols = "!@#$%^&*()-_=+[]{}|;:,.<>?"

    // MARK: - BIP-39 Mnemonic Generation

    /// Generate a BIP-39 mnemonic phrase.
    ///
    /// - Parameter strength: Entropy bits (128=12 words, 256=24 words). Default: 256
    /// - Returns: Space-separated mnemonic words
    public static func generateMnemonic(strength: Int = 256) -> String {
        let wordlist = WordlistEN.words
        precondition([128, 160, 192, 224, 256].contains(strength))

        // 1. Generate random entropy
        let entropyBytes = strength / 8
        var entropy = Data(count: entropyBytes)
        entropy.withUnsafeMutableBytes { ptr in
            _ = SecRandomCopyBytes(kSecRandomDefault, entropyBytes, ptr.baseAddress!)
        }

        // 2. Checksum: first (strength/32) bits of SHA-256(entropy)
        let hash = Data(SHA256.hash(data: entropy))
        let checksumBits = strength / 32

        // 3. Build bit string: entropy + checksum
        var bits = ""
        for byte in entropy {
            bits += String(byte, radix: 2).leftPadded(toLength: 8, with: "0")
        }
        for i in 0..<checksumBits {
            let byteIndex = i / 8
            let bitIndex = 7 - (i % 8)
            bits += String((hash[byteIndex] >> bitIndex) & 1)
        }

        // 4. Split into 11-bit groups -> word indices
        var words: [String] = []
        for i in stride(from: 0, to: bits.count, by: 11) {
            let start = bits.index(bits.startIndex, offsetBy: i)
            let end = bits.index(start, offsetBy: 11)
            let index = Int(bits[start..<end], radix: 2)!
            words.append(wordlist[index])
        }

        return words.joined(separator: " ")
    }

    /// Validate a BIP-39 mnemonic phrase.
    ///
    /// Checks word count, wordlist membership, and checksum.
    public static func validateMnemonic(_ mnemonic: String) -> Bool {
        let wordlist = WordlistEN.words
        let words = mnemonic.trimmingCharacters(in: .whitespaces)
            .components(separatedBy: .whitespaces)
            .filter { !$0.isEmpty }

        let validCounts = [12, 15, 18, 21, 24]
        guard validCounts.contains(words.count) else { return false }

        // Convert words to bit string
        var bits = ""
        for word in words {
            guard let index = wordlist.firstIndex(of: word) else { return false }
            bits += String(index, radix: 2).leftPadded(toLength: 11, with: "0")
        }

        // Split entropy and checksum
        let strength = (words.count * 11 * 32) / 33
        let entropyBits = String(bits.prefix(strength))
        let checksumBits = String(bits.suffix(bits.count - strength))

        // Reconstruct entropy bytes
        var entropy = Data(count: strength / 8)
        for i in 0..<entropy.count {
            let start = entropyBits.index(entropyBits.startIndex, offsetBy: i * 8)
            let end = entropyBits.index(start, offsetBy: 8)
            entropy[i] = UInt8(entropyBits[start..<end], radix: 2)!
        }

        // Verify checksum
        let hash = Data(SHA256.hash(data: entropy))
        let expectedChecksumLength = strength / 32
        var expectedChecksum = ""
        for i in 0..<expectedChecksumLength {
            let byteIndex = i / 8
            let bitIndex = 7 - (i % 8)
            expectedChecksum += String((hash[byteIndex] >> bitIndex) & 1)
        }

        return checksumBits == expectedChecksum
    }

    // MARK: - BIP-39 Mnemonic -> Seed

    /// Convert a mnemonic to a 512-bit seed using PBKDF2-HMAC-SHA512.
    ///
    /// Parameters match BIP-39 spec exactly:
    /// - 2048 iterations
    /// - Salt: "mnemonic" + passphrase (NFKD normalized)
    /// - 64-byte output
    public static func mnemonicToSeed(_ mnemonic: String, passphrase: String = "") -> Data {
        let mnemonicData = Data(mnemonic.precomposedStringWithCompatibilityMapping.utf8)
        let saltString = "mnemonic" + passphrase.precomposedStringWithCompatibilityMapping
        let saltData = Data(saltString.utf8)

        // PBKDF2-HMAC-SHA512, 2048 iterations, 64-byte output
        var derivedKey = Data(count: 64)
        _ = derivedKey.withUnsafeMutableBytes { derivedPtr in
            mnemonicData.withUnsafeBytes { passwordPtr in
                saltData.withUnsafeBytes { saltPtr in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2),
                        passwordPtr.baseAddress?.assumingMemoryBound(to: Int8.self),
                        mnemonicData.count,
                        saltPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                        saltData.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA512),
                        2048,
                        derivedPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                        64
                    )
                }
            }
        }

        return derivedKey
    }

    // MARK: - HD Key Derivation

    private struct HDKey {
        let key: Data       // 32-byte private key material
        let chainCode: Data // 32-byte chain code
    }

    /// Derive master key from BIP-39 seed.
    /// HMAC-SHA512 with "authbox seed" as key (NOT "Bitcoin seed").
    private static func masterKeyFromSeed(_ seed: Data) -> HDKey {
        let hmacKey = SymmetricKey(data: Data("authbox seed".utf8))
        let I = Data(HMAC<SHA512>.authenticationCode(for: seed, using: hmacKey))
        return HDKey(
            key: I.prefix(32),
            chainCode: I.suffix(from: 32)
        )
    }

    /// Derive a hardened child key.
    /// Data format: 0x00 || parent.key || uint32BE(index | 0x80000000)
    private static func deriveHardenedChild(_ parent: HDKey, index: UInt32) -> HDKey {
        var data = Data(count: 37)
        data[0] = 0x00
        data.replaceSubrange(1..<33, with: parent.key)
        let hardenedIndex = index | hardenedOffset
        data[33] = UInt8((hardenedIndex >> 24) & 0xFF)
        data[34] = UInt8((hardenedIndex >> 16) & 0xFF)
        data[35] = UInt8((hardenedIndex >> 8) & 0xFF)
        data[36] = UInt8(hardenedIndex & 0xFF)

        let hmacKey = SymmetricKey(data: parent.chainCode)
        let I = Data(HMAC<SHA512>.authenticationCode(for: data, using: hmacKey))
        return HDKey(
            key: I.prefix(32),
            chainCode: I.suffix(from: 32)
        )
    }

    /// Derive a key for a specific Auth Box purpose.
    ///
    /// Path: m / AUTH_BOX_PURPOSE' / purpose' / index'
    ///
    /// - Parameters:
    ///   - seed: 64-byte BIP-39 seed
    ///   - purpose: Key purpose (vault, sync, agent, derive, auth)
    ///   - index: Sub-index (e.g., agent number)
    /// - Returns: 32-byte derived key
    public static func deriveKey(seed: Data, purpose: KeyPurpose, index: UInt32 = 0) -> Data {
        let master = masterKeyFromSeed(seed)
        let purposeNode = deriveHardenedChild(master, index: authBoxPurpose)
        let typeNode = deriveHardenedChild(purposeNode, index: purpose.rawValue)
        let leaf = deriveHardenedChild(typeNode, index: index)
        return leaf.key
    }

    /// Derive all primary keys from a seed.
    public static func deriveAllKeys(seed: Data) -> SeedKeyBundle {
        SeedKeyBundle(
            vaultKey: deriveKey(seed: seed, purpose: .vault, index: 0),
            syncKey: deriveKey(seed: seed, purpose: .sync, index: 0),
            authKey: deriveKey(seed: seed, purpose: .auth, index: 0),
            agentRootKey: deriveKey(seed: seed, purpose: .agent, index: 0)
        )
    }

    /// Derive a per-agent delegation key.
    public static func deriveAgentKey(seed: Data, agentIndex: UInt32) -> Data {
        deriveKey(seed: seed, purpose: .agent, index: agentIndex)
    }

    // MARK: - Deterministic Password Derivation

    /// Deterministically derive a password for a site from the seed.
    ///
    /// Same seed + site = same password, every time, offline.
    /// Mirrors the TypeScript implementation exactly for cross-platform compatibility.
    ///
    /// Algorithm:
    /// 1. siteHash = SHA-256(site.lower() + "\0" + counter)
    /// 2. siteIndex = first 4 bytes of siteHash as uint32 big-endian
    /// 3. siteKey = deriveKey(seed, .derive, siteIndex)
    /// 4. expanded = HMAC-SHA512(siteKey, "password:" + site.lower() + ":" + counter)
    /// 5. password chars selected by expanded[i] % charset.length
    public static func derivePassword(
        seed: Data,
        site: String,
        options: DerivePasswordOptions = DerivePasswordOptions()
    ) -> String {
        let length = options.length
        let counter = options.counter

        // Build character set
        var charset = ""
        if options.lowercase { charset += passwordCharsLower }
        if options.uppercase { charset += passwordCharsUpper }
        if options.digits    { charset += passwordCharsDigits }
        if options.symbols   { charset += passwordCharsSymbols }

        precondition(!charset.isEmpty, "At least one character class must be enabled")
        let charsetArray = Array(charset)

        // Derive site-specific key material
        let normalizedSite = site.lowercased()
        let siteHashInput = Data((normalizedSite + "\0" + String(counter)).utf8)
        let siteHash = Data(SHA256.hash(data: siteHashInput))

        let siteIndex: UInt32 = siteHash.withUnsafeBytes { ptr in
            let b = ptr.bindMemory(to: UInt8.self)
            return (UInt32(b[0]) << 24) | (UInt32(b[1]) << 16) | (UInt32(b[2]) << 8) | UInt32(b[3])
        }

        let siteKey = deriveKey(seed: seed, purpose: .derive, index: siteIndex)

        // Expand key material using HMAC-SHA512
        let expandInput = Data(("password:" + normalizedSite + ":" + String(counter)).utf8)
        let hmacKey = SymmetricKey(data: siteKey)
        let expanded = Data(HMAC<SHA512>.authenticationCode(for: expandInput, using: hmacKey))

        // Convert to password characters
        var password: [Character] = []
        var byteIdx = 0

        while password.count < length {
            if byteIdx >= expanded.count {
                // Need more bytes -- rehash (matches TS behavior)
                var moreInput = expanded
                moreInput.append(Data(String(password.count).utf8))
                let more = Data(HMAC<SHA512>.authenticationCode(for: moreInput, using: hmacKey))
                for i in 0..<more.count where password.count < length {
                    let charIdx = Int(more[i]) % charsetArray.count
                    password.append(charsetArray[charIdx])
                }
                break
            }

            let charIdx = Int(expanded[byteIdx]) % charsetArray.count
            password.append(charsetArray[charIdx])
            byteIdx += 1
        }

        return String(password)
    }
}

// MARK: - CommonCrypto Bridge

import CommonCrypto

// MARK: - String Helpers

extension String {
    func leftPadded(toLength length: Int, with character: Character) -> String {
        let deficit = length - count
        if deficit <= 0 { return self }
        return String(repeating: character, count: deficit) + self
    }
}
