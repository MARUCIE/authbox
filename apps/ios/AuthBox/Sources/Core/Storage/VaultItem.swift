import Foundation
import SwiftData

/// Local vault item model for SwiftData persistence.
/// Items are stored encrypted; this model represents the decrypted view.
@Model
final class VaultItem {
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
    /// Empty when the item has no associated TOTP. The default value keeps
    /// SwiftData lightweight migration happy for stores created before 2FA.
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
