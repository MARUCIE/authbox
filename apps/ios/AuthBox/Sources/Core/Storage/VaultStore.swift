import Foundation
import SwiftData
import AuthBoxCrypto

/// Ciphertext-at-rest persistence row. Only the item id and timestamps are
/// visible to the store (needed for lookup, ordering, and last-write-wins);
/// every content field — title, username, password, notes, otpauth — lives
/// inside one AES-256-GCM `VaultItemPayload` blob under the vault key. This
/// mirrors the macOS VaultStore design and is the same envelope the CloudKit
/// and server sync paths already use.
@Model
final class EncryptedVaultRecord {
    @Attribute(.unique) var id: UUID
    var ciphertext: Data
    var nonce: Data
    var tag: Data
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID, ciphertext: Data, nonce: Data, tag: Data, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.ciphertext = ciphertext
        self.nonce = nonce
        self.tag = tag
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

/// Manages local vault persistence using SwiftData.
///
/// Items are encrypted with the vault key BEFORE they reach the store; the
/// vault key itself lives only in memory (derived from the Keychain seed on
/// unlock). Decrypted `VaultItem`s never touch disk.
@MainActor
final class VaultStore {

    private let modelContainer: ModelContainer
    private let modelContext: ModelContext

    /// Dedicated store file for the ciphertext schema. Using a NEW file (not
    /// SwiftData's default.store) sidesteps schema migration from the old
    /// plaintext VaultItem table entirely; the old file is purged below so
    /// plaintext secrets do not linger on disk. Local storage is a cache —
    /// the durable copies are the CloudKit/server ciphertext blobs.
    private static var storeURL: URL {
        URL.applicationSupportDirectory.appending(path: "AuthBoxVault.store")
    }

    init(inMemory: Bool = false) throws {
        let schema = Schema([EncryptedVaultRecord.self])
        let config: ModelConfiguration
        if inMemory {
            config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        } else {
            try? FileManager.default.createDirectory(
                at: URL.applicationSupportDirectory, withIntermediateDirectories: true)
            Self.purgeLegacyPlaintextStore()
            config = ModelConfiguration(
                schema: schema,
                url: Self.storeURL,
                // Zero-knowledge invariant: the local SwiftData store must NEVER
                // mirror to CloudKit. `.automatic` would silently enable
                // NSPersistentCloudKitContainer under the CloudKit entitlement;
                // the sole CloudKit traffic is CKSyncEngine's AES-GCM blobs.
                cloudKitDatabase: .none
            )
        }
        modelContainer = try ModelContainer(for: schema, configurations: [config])
        modelContext = modelContainer.mainContext
    }

    /// Best-effort deletion of the pre-ciphertext store files, which held every
    /// secret as plaintext columns. Items re-materialize from CloudKit sync.
    private static func purgeLegacyPlaintextStore() {
        let fm = FileManager.default
        for suffix in ["default.store", "default.store-shm", "default.store-wal"] {
            let url = URL.applicationSupportDirectory.appending(path: suffix)
            try? fm.removeItem(at: url)
        }
    }

    // MARK: - CRUD (encrypting)

    /// Decrypt every stored record with the vault key, newest first. A record
    /// that fails authentication is skipped (corrupt row), never fatal.
    func fetchAll(vaultKey: Data) throws -> [VaultItem] {
        let descriptor = FetchDescriptor<EncryptedVaultRecord>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        let records = try modelContext.fetch(descriptor)
        return records.compactMap { try? Self.decryptRecord($0, vaultKey: vaultKey) }
    }

    func insert(_ item: VaultItem, vaultKey: Data) throws {
        let payload = try Self.encryptItem(item, vaultKey: vaultKey)
        let record = EncryptedVaultRecord(
            id: item.id,
            ciphertext: payload.ciphertext,
            nonce: payload.nonce,
            tag: payload.tag,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        )
        modelContext.insert(record)
        try modelContext.save()
    }

    /// Re-encrypt an edited item into its existing record (insert when absent).
    func update(_ item: VaultItem, vaultKey: Data) throws {
        let id = item.id
        let descriptor = FetchDescriptor<EncryptedVaultRecord>(
            predicate: #Predicate<EncryptedVaultRecord> { $0.id == id }
        )
        guard let record = try modelContext.fetch(descriptor).first else {
            try insert(item, vaultKey: vaultKey)
            return
        }
        let payload = try Self.encryptItem(item, vaultKey: vaultKey)
        record.ciphertext = payload.ciphertext
        record.nonce = payload.nonce
        record.tag = payload.tag
        record.updatedAt = item.updatedAt
        try modelContext.save()
    }

    func delete(id: UUID) throws {
        let descriptor = FetchDescriptor<EncryptedVaultRecord>(
            predicate: #Predicate<EncryptedVaultRecord> { $0.id == id }
        )
        for record in try modelContext.fetch(descriptor) {
            modelContext.delete(record)
        }
        try modelContext.save()
    }

    func deleteAll() throws {
        let records = try modelContext.fetch(FetchDescriptor<EncryptedVaultRecord>())
        for record in records {
            modelContext.delete(record)
        }
        try modelContext.save()
    }

    // MARK: - Envelope helpers

    private static func encryptItem(_ item: VaultItem, vaultKey: Data) throws -> EncryptedPayload {
        let json = try JSONEncoder().encode(VaultItemPayload(from: item))
        guard let plaintext = String(data: json, encoding: .utf8) else {
            throw AuthBoxError.decryptionFailed("Item payload is not valid UTF-8")
        }
        return try VaultCrypto.encryptVaultItem(vaultKey: vaultKey, plaintext: plaintext)
    }

    private static func decryptRecord(_ record: EncryptedVaultRecord, vaultKey: Data) throws -> VaultItem {
        let payload = EncryptedPayload(
            ciphertext: record.ciphertext,
            nonce: record.nonce,
            tag: record.tag
        )
        let json = try VaultCrypto.decryptVaultItem(vaultKey: vaultKey, payload: payload)
        let decoded = try JSONDecoder().decode(VaultItemPayload.self, from: Data(json.utf8))
        let item = decoded.toVaultItem()
        item.id = record.id
        item.createdAt = record.createdAt
        item.updatedAt = record.updatedAt
        return item
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
        guard let ciphertextData = Data(base64Encoded: encryptedData),
              let nonceData = Data(base64Encoded: nonce),
              let tagData = Data(base64Encoded: tag) else {
            throw AuthBoxError.decryptionFailed("Malformed base64 in sync payload")
        }
        let payload = EncryptedPayload(
            ciphertext: ciphertextData,
            nonce: nonceData,
            tag: tagData
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
