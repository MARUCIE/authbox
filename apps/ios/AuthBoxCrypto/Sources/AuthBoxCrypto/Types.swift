import Foundation

// MARK: - Key Purpose

/// Auth Box HD key derivation purposes.
/// Path: m / ABX' / purpose' / index'
public enum KeyPurpose: UInt32, Sendable {
    case vault  = 0  // m/ABX'/vault'/0'
    case sync   = 1  // m/ABX'/sync'/0'
    case agent  = 2  // m/ABX'/agent'/n'
    case derive = 3  // m/ABX'/derive'/n'
    case auth   = 4  // m/ABX'/auth'/0'
}

/// Sub-key derivation purpose for HKDF domain separation.
public enum SubKeyPurpose: String, Sendable {
    case auth = "auth"
    case enc  = "enc"
    case mac  = "mac"
}

// MARK: - Encrypted Payload

/// AES-256-GCM encryption result with separated nonce and tag.
public struct EncryptedPayload: Sendable {
    public let ciphertext: Data
    public let nonce: Data      // 12 bytes
    public let tag: Data        // 16 bytes

    public init(ciphertext: Data, nonce: Data, tag: Data) {
        self.ciphertext = ciphertext
        self.nonce = nonce
        self.tag = tag
    }
}

// MARK: - Vault Key Bundle

/// Encrypted vault key stored on the server.
public struct VaultKeyBundle: Sendable {
    public let encryptedVaultKey: Data
    public let nonce: Data
    public let tag: Data

    public init(encryptedVaultKey: Data, nonce: Data, tag: Data) {
        self.encryptedVaultKey = encryptedVaultKey
        self.nonce = nonce
        self.tag = tag
    }
}

// MARK: - Seed Key Bundle

/// All primary keys derived from a BIP-39 seed.
public struct SeedKeyBundle: Sendable {
    public let vaultKey: Data       // For encrypting the vault
    public let syncKey: Data        // For encrypting sync payloads
    public let authKey: Data        // For authentication signing
    public let agentRootKey: Data   // Root key for agent delegation
}

// MARK: - Derived Keys (from password)

/// Three purpose-specific keys derived from master password via Argon2id + HKDF.
public struct DerivedKeys: Sendable {
    public let authKey: Data   // For SRP authentication
    public let encKey: Data    // For encrypting vault key
    public let macKey: Data    // For HMAC (server-side matching)
}

// MARK: - SRP Client State

/// Ephemeral key pair for SRP-6a login.
public struct SRPClientState: Sendable {
    public let ephemeralSecret: Data   // 'a' (private, 32 bytes)
    public let ephemeralPublic: Data   // 'A = g^a mod N' (256 bytes)
}

// MARK: - Password Derivation Options

/// Options for deterministic password generation.
public struct DerivePasswordOptions: Sendable {
    public var length: Int
    public var lowercase: Bool
    public var uppercase: Bool
    public var digits: Bool
    public var symbols: Bool
    public var counter: Int

    public init(
        length: Int = 20,
        lowercase: Bool = true,
        uppercase: Bool = true,
        digits: Bool = true,
        symbols: Bool = true,
        counter: Int = 0
    ) {
        self.length = length
        self.lowercase = lowercase
        self.uppercase = uppercase
        self.digits = digits
        self.symbols = symbols
        self.counter = counter
    }
}
