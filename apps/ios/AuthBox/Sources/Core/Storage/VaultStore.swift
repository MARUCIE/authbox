import Foundation
import SwiftData
import AuthBoxCrypto

/// Manages local vault persistence using SwiftData.
///
/// Items are encrypted with the vault key before storage.
/// The vault key itself lives only in memory (from Keychain on unlock).
@MainActor
final class VaultStore {

    private let modelContainer: ModelContainer
    private let modelContext: ModelContext

    init() throws {
        let schema = Schema([VaultItem.self])
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            groupContainer: .none  // DEV: restore .identifier("group.com.authbox.shared") when paid team is active
        )
        modelContainer = try ModelContainer(for: schema, configurations: [config])
        modelContext = modelContainer.mainContext
    }

    // MARK: - CRUD

    func fetchAll() throws -> [VaultItem] {
        let descriptor = FetchDescriptor<VaultItem>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        return try modelContext.fetch(descriptor)
    }

    func search(_ query: String) throws -> [VaultItem] {
        let descriptor = FetchDescriptor<VaultItem>(
            predicate: #Predicate<VaultItem> { item in
                item.title.localizedStandardContains(query) ||
                item.username.localizedStandardContains(query) ||
                item.uri.localizedStandardContains(query)
            },
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        return try modelContext.fetch(descriptor)
    }

    func insert(_ item: VaultItem) throws {
        modelContext.insert(item)
        try modelContext.save()
    }

    func delete(_ item: VaultItem) throws {
        modelContext.delete(item)
        try modelContext.save()
    }

    func deleteAll() throws {
        let items = try fetchAll()
        for item in items {
            modelContext.delete(item)
        }
        try modelContext.save()
    }

    func save() throws {
        try modelContext.save()
    }

    // MARK: - Encrypted Sync

    /// Encrypt a vault item for server sync.
    static func encryptForSync(item: VaultItem, vaultKey: Data) throws -> (encryptedData: String, nonce: String, tag: String) {
        let json = try JSONEncoder().encode(VaultItemPayload(from: item))
        let payload = try VaultCrypto.encryptVaultItem(vaultKey: vaultKey, plaintext: String(data: json, encoding: .utf8)!)
        return (
            encryptedData: payload.ciphertext.base64EncodedString(),
            nonce: payload.nonce.base64EncodedString(),
            tag: payload.tag.base64EncodedString()
        )
    }

    /// Decrypt a server vault item into local model.
    static func decryptFromSync(
        encryptedData: String,
        nonce: String,
        tag: String,
        vaultKey: Data,
        serverID: String
    ) throws -> VaultItem {
        let payload = EncryptedPayload(
            ciphertext: Data(base64Encoded: encryptedData)!,
            nonce: Data(base64Encoded: nonce)!,
            tag: Data(base64Encoded: tag)!
        )
        let json = try VaultCrypto.decryptVaultItem(vaultKey: vaultKey, payload: payload)
        let decoded = try JSONDecoder().decode(VaultItemPayload.self, from: Data(json.utf8))
        return decoded.toVaultItem()
    }
}

/// Wire format for vault item encryption/decryption.
struct VaultItemPayload: Codable {
    let title: String
    let username: String
    let password: String
    let uri: String
    let notes: String
    let category: String
    let isFavorite: Bool
    let otpauth: String

    init(from item: VaultItem) {
        self.title = item.title
        self.username = item.username
        self.password = item.password
        self.uri = item.uri
        self.notes = item.notes
        self.category = item.category.rawValue
        self.isFavorite = item.isFavorite
        self.otpauth = item.otpauth
    }

    func toVaultItem() -> VaultItem {
        VaultItem(
            title: title,
            username: username,
            password: password,
            uri: uri,
            notes: notes,
            category: ItemCategory(rawValue: category) ?? .login,
            isFavorite: isFavorite,
            otpauth: otpauth
        )
    }
}
