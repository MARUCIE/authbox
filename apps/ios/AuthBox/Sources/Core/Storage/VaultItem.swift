import Foundation

/// In-memory (decrypted) vault item.
///
/// This type is deliberately NOT a SwiftData model: persisting these fields as
/// columns stored every password and 2FA secret as PLAINTEXT in the local
/// SQLite file — readable from any unencrypted backup or file-level access,
/// making Face ID and the seed cosmetic for at-rest security. Persistence goes
/// through `EncryptedVaultRecord` (ciphertext + nonce + tag under the vault
/// key, same AES-256-GCM `VaultItemPayload` envelope the sync path uses);
/// decrypted items exist only in memory after unlock.
final class VaultItem: Identifiable {
    var id: UUID
    var title: String
    var username: String
    var password: String
    var uri: String
    var notes: String
    var category: ItemCategory
    var createdAt: Date
    var updatedAt: Date
    var isFavorite: Bool

    /// Authenticator (2FA) secret as an `otpauth://` URI or a bare base32 secret.
    /// Empty when the item has no associated TOTP.
    var otpauth: String = ""

    init(
        title: String,
        username: String = "",
        password: String = "",
        uri: String = "",
        notes: String = "",
        category: ItemCategory = .login,
        isFavorite: Bool = false,
        otpauth: String = ""
    ) {
        self.id = UUID()
        self.title = title
        self.username = username
        self.password = password
        self.uri = uri
        self.notes = notes
        self.category = category
        self.createdAt = Date()
        self.updatedAt = Date()
        self.isFavorite = isFavorite
        self.otpauth = otpauth
    }
}

enum ItemCategory: String, Codable, CaseIterable {
    case login      = "login"
    case apiKey     = "api_key"
    case secureNote = "secure_note"
    case identity   = "identity"
    case card       = "card"

    var displayName: String {
        switch self {
        case .login: "Login"
        case .apiKey: "API Key"
        case .secureNote: "Secure Note"
        case .identity: "Identity"
        case .card: "Card"
        }
    }

    var iconName: String {
        switch self {
        case .login: "key.fill"
        case .apiKey: "server.rack"
        case .secureNote: "doc.text.fill"
        case .identity: "person.fill"
        case .card: "creditcard.fill"
        }
    }
}
