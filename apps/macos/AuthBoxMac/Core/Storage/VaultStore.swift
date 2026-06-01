//
//  VaultStore.swift
//  P2 — local SwiftData store. Holds ONLY ciphertext blobs (the item secret,
//  encrypted with the vault key) plus searchable metadata. The plaintext secret
//  never lands in SwiftData; the vault key lives only in VaultSession's memory.
//

import Foundation
import SwiftData

@Model
final class VaultItemRecord {
    @Attribute(.unique) var id: UUID
    // searchable metadata (not the secret)
    var title: String
    var username: String
    var urlString: String
    var categoryId: String?
    var providerId: String?
    // encrypted secret payload (AuthBoxCrypto.EncryptedPayload, split into columns)
    var ciphertext: Data
    var nonce: Data
    var tag: Data
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID = UUID(),
         title: String,
         username: String = "",
         urlString: String = "",
         categoryId: String? = nil,
         providerId: String? = nil,
         ciphertext: Data,
         nonce: Data,
         tag: Data,
         createdAt: Date = .now,
         updatedAt: Date = .now) {
        self.id = id
        self.title = title
        self.username = username
        self.urlString = urlString
        self.categoryId = categoryId
        self.providerId = providerId
        self.ciphertext = ciphertext
        self.nonce = nonce
        self.tag = tag
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

@MainActor
final class VaultStore {
    let container: ModelContainer
    private var context: ModelContext { container.mainContext }

    init(inMemory: Bool = false) throws {
        let config = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        container = try ModelContainer(for: VaultItemRecord.self, configurations: config)
    }

    func insert(_ record: VaultItemRecord) throws {
        context.insert(record)
        try context.save()
    }

    func update(_ record: VaultItemRecord) throws {
        record.updatedAt = .now
        try context.save()
    }

    func all() throws -> [VaultItemRecord] {
        try context.fetch(
            FetchDescriptor<VaultItemRecord>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        )
    }

    func find(_ id: UUID) throws -> VaultItemRecord? {
        try context.fetch(FetchDescriptor<VaultItemRecord>(
            predicate: #Predicate { $0.id == id }
        )).first
    }

    func delete(_ id: UUID) throws {
        if let r = try find(id) {
            context.delete(r)
            try context.save()
        }
    }
}
