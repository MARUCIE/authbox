//
//  VaultService.swift
//  P2 — orchestrates item encryption (AuthBoxCrypto.VaultCrypto) + local storage.
//  The vault key is passed in per call from VaultSession; this service never
//  holds or persists it.
//

import Foundation
import AuthBoxCrypto

/// The sensitive part of an item, encrypted as a JSON string (per
/// VaultCrypto.encryptVaultItem's "JSON string" contract).
struct VaultSecret: Codable, Equatable {
    var secret: String          // password or API key value
    var notes: String = ""
    /// Multi-field provider credentials (e.g. AWS access_key_id + secret_access_key).
    /// Nil for simple password items; populated by Provider Hub imports.
    var fields: [String: String]? = nil
}

/// Decrypted, displayable item (metadata only; secret fetched on demand via reveal).
struct VaultItem: Identifiable, Hashable {
    let id: UUID
    var title: String
    var username: String
    var urlString: String
    var categoryId: String?
    var providerId: String?
    var updatedAt: Date

    init(record r: VaultItemRecord) {
        id = r.id; title = r.title; username = r.username; urlString = r.urlString
        categoryId = r.categoryId; providerId = r.providerId; updatedAt = r.updatedAt
    }
}

enum VaultServiceError: Error, Equatable { case locked, notFound }

@MainActor
final class VaultService {
    private let store: VaultStore
    init(store: VaultStore) { self.store = store }

    func list() throws -> [VaultItem] {
        try store.all().map(VaultItem.init(record:))
    }

    @discardableResult
    func add(title: String, username: String = "", urlString: String = "",
             categoryId: String? = nil, providerId: String? = nil,
             secret: VaultSecret, vaultKey: Data) throws -> VaultItem {
        let payload = try encrypt(secret, vaultKey: vaultKey)
        let rec = VaultItemRecord(title: title, username: username, urlString: urlString,
                                  categoryId: categoryId, providerId: providerId,
                                  ciphertext: payload.ciphertext, nonce: payload.nonce, tag: payload.tag)
        try store.insert(rec)
        return VaultItem(record: rec)
    }

    /// Decrypt the secret on demand (requires the unlocked vault key).
    func reveal(_ id: UUID, vaultKey: Data) throws -> VaultSecret {
        guard let rec = try store.find(id) else { throw VaultServiceError.notFound }
        let payload = EncryptedPayload(ciphertext: rec.ciphertext, nonce: rec.nonce, tag: rec.tag)
        let json = try VaultCrypto.decryptVaultItem(vaultKey: vaultKey, payload: payload)
        return try JSONDecoder().decode(VaultSecret.self, from: Data(json.utf8))
    }

    func updateSecret(_ id: UUID, secret: VaultSecret, vaultKey: Data) throws {
        guard let rec = try store.find(id) else { throw VaultServiceError.notFound }
        let payload = try encrypt(secret, vaultKey: vaultKey)
        rec.ciphertext = payload.ciphertext; rec.nonce = payload.nonce; rec.tag = payload.tag
        try store.update(rec)
    }

    func delete(_ id: UUID) throws { try store.delete(id) }

    private func encrypt(_ secret: VaultSecret, vaultKey: Data) throws -> EncryptedPayload {
        let json = String(decoding: try JSONEncoder().encode(secret), as: UTF8.self)
        return try VaultCrypto.encryptVaultItem(vaultKey: vaultKey, plaintext: json)
    }
}
