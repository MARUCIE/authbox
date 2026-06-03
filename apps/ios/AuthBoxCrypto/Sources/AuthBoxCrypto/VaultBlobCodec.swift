import Foundation
import CloudKit

/// The CloudKit wire layer for iCloud sync: a vault item ↔ a `CKRecord` that
/// carries **only ciphertext**.
///
/// `ICLOUD_SYNC_ARCHITECTURE.md` §1-2: iCloud is Apple-readable, so the record
/// must never hold a plaintext field. This codec encrypts the item's payload
/// with the vault key (`VaultCrypto`) before it ever becomes a `CKRecord`, and
/// decrypts on the way back. It is pure and container-free — `CKRecord`
/// instantiates offline — so the zero-knowledge-on-the-wire property is
/// unit-provable ahead of the entitlement, like `VaultSyncReconciler` and the
/// `VaultStore` codec.
///
/// The app layer supplies the item's payload as a JSON string (the same
/// `VaultItemPayload` JSON the on-device codec already uses) and the `id` /
/// `updatedAt`; this type stays free of the SwiftData model so it lives in the
/// crypto package.
public enum VaultBlobCodec {
    public static let recordType = "VaultItemBlob"

    public enum Field {
        public static let ciphertext = "ciphertext"
        public static let nonce = "nonce"
        public static let tag = "tag"
        public static let updatedAt = "updatedAt"
    }

    public enum CodecError: Error, Equatable {
        case missingField(String)
        case malformedBase64(String)
    }

    /// A decoded blob: the item's plaintext payload JSON plus its sync metadata.
    public struct DecodedBlob: Equatable {
        public let id: UUID
        public let plaintextJSON: String
        public let updatedAt: Date?
    }

    /// Encrypt `plaintextJSON` and pack it into a `CKRecord` whose `recordName`
    /// is the item id (so the record is stable across edits — an update
    /// overwrites the same record).
    public static func makeRecord(
        id: UUID,
        plaintextJSON: String,
        vaultKey: Data,
        updatedAt: Date,
        zoneID: CKRecordZone.ID
    ) throws -> CKRecord {
        let payload = try VaultCrypto.encryptVaultItem(vaultKey: vaultKey, plaintext: plaintextJSON)
        let recordID = CKRecord.ID(recordName: id.uuidString, zoneID: zoneID)
        let record = CKRecord(recordType: recordType, recordID: recordID)
        record[Field.ciphertext] = payload.ciphertext.base64EncodedString() as CKRecordValue
        record[Field.nonce] = payload.nonce.base64EncodedString() as CKRecordValue
        record[Field.tag] = payload.tag.base64EncodedString() as CKRecordValue
        record[Field.updatedAt] = updatedAt as CKRecordValue
        return record
    }

    /// Decrypt a fetched record back to its plaintext payload, restoring the id
    /// from the `recordName` (the on-device codec alone can't — it would mint a
    /// fresh UUID and orphan the record on the next push).
    public static func decode(_ record: CKRecord, vaultKey: Data) throws -> DecodedBlob {
        let ciphertext = try base64Field(record, Field.ciphertext)
        let nonce = try base64Field(record, Field.nonce)
        let tag = try base64Field(record, Field.tag)

        let payload = EncryptedPayload(ciphertext: ciphertext, nonce: nonce, tag: tag)
        let json = try VaultCrypto.decryptVaultItem(vaultKey: vaultKey, payload: payload)

        let id = UUID(uuidString: record.recordID.recordName) ?? UUID()
        return DecodedBlob(id: id, plaintextJSON: json, updatedAt: record[Field.updatedAt] as? Date)
    }

    private static func base64Field(_ record: CKRecord, _ key: String) throws -> Data {
        guard let string = record[key] as? String else { throw CodecError.missingField(key) }
        guard let data = Data(base64Encoded: string) else { throw CodecError.malformedBase64(key) }
        return data
    }
}
