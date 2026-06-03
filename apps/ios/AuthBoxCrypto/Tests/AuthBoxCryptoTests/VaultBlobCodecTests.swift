import XCTest
import CloudKit
@testable import AuthBoxCrypto

final class VaultBlobCodecTests: XCTestCase {
    private let zoneID = CKRecordZone.ID(zoneName: "VaultZone", ownerName: CKCurrentUserDefaultName)
    private let vaultKey = Data((0..<32).map { UInt8($0) }) // deterministic 32-byte test key

    // A representative plaintext payload — the JSON the on-device codec produces.
    private let plaintextJSON = """
    {"title":"GitHub","username":"octocat","password":"S3cr3t-P@ss!","uri":"https://github.com","notes":"","category":"login","isFavorite":false,"otpauth":"otpauth://totp/GitHub:octocat?secret=GEZDGNBVGY3TQOJQ"}
    """

    func testRoundTripPreservesPayloadIdAndUpdatedAt() throws {
        let id = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        let updatedAt = Date(timeIntervalSince1970: 1_700_000_000)

        let record = try VaultBlobCodec.makeRecord(
            id: id, plaintextJSON: plaintextJSON, vaultKey: vaultKey, updatedAt: updatedAt, zoneID: zoneID
        )
        XCTAssertEqual(record.recordType, VaultBlobCodec.recordType)
        XCTAssertEqual(record.recordID.recordName, id.uuidString)

        let decoded = try VaultBlobCodec.decode(record, vaultKey: vaultKey)
        XCTAssertEqual(decoded.id, id)                       // id restored from recordName
        XCTAssertEqual(decoded.plaintextJSON, plaintextJSON) // payload survives encrypt→record→decrypt
        XCTAssertEqual(decoded.updatedAt, updatedAt)
    }

    func testRecordCarriesNoPlaintext() throws {
        // The zero-knowledge-on-the-wire property: nothing Apple-readable in the
        // record may equal a plaintext secret.
        let record = try VaultBlobCodec.makeRecord(
            id: UUID(), plaintextJSON: plaintextJSON, vaultKey: vaultKey,
            updatedAt: Date(timeIntervalSince1970: 1), zoneID: zoneID
        )
        for key in [VaultBlobCodec.Field.ciphertext, VaultBlobCodec.Field.nonce, VaultBlobCodec.Field.tag] {
            let value = record[key] as? String ?? ""
            XCTAssertFalse(value.contains("S3cr3t-P@ss!"), "\(key) leaked the password")
            XCTAssertFalse(value.contains("GEZDGNBVGY3TQOJQ"), "\(key) leaked the TOTP secret")
            XCTAssertFalse(value.contains("octocat"), "\(key) leaked the username")
        }
    }

    func testEncryptionIsNonDeterministic() throws {
        // Fresh AES-GCM nonce each time → two records of the same item differ.
        let id = UUID()
        let a = try VaultBlobCodec.makeRecord(id: id, plaintextJSON: plaintextJSON, vaultKey: vaultKey, updatedAt: Date(timeIntervalSince1970: 1), zoneID: zoneID)
        let b = try VaultBlobCodec.makeRecord(id: id, plaintextJSON: plaintextJSON, vaultKey: vaultKey, updatedAt: Date(timeIntervalSince1970: 1), zoneID: zoneID)
        XCTAssertNotEqual(a[VaultBlobCodec.Field.ciphertext] as? String, b[VaultBlobCodec.Field.ciphertext] as? String)
    }

    func testWrongKeyCannotDecrypt() throws {
        let record = try VaultBlobCodec.makeRecord(id: UUID(), plaintextJSON: plaintextJSON, vaultKey: vaultKey, updatedAt: Date(timeIntervalSince1970: 1), zoneID: zoneID)
        let wrongKey = Data((0..<32).map { _ in UInt8(0xFF) })
        XCTAssertThrowsError(try VaultBlobCodec.decode(record, vaultKey: wrongKey))
    }

    func testMissingFieldThrows() throws {
        let record = CKRecord(recordType: VaultBlobCodec.recordType,
                              recordID: CKRecord.ID(recordName: UUID().uuidString, zoneID: zoneID))
        XCTAssertThrowsError(try VaultBlobCodec.decode(record, vaultKey: vaultKey)) { error in
            XCTAssertEqual(error as? VaultBlobCodec.CodecError, .missingField(VaultBlobCodec.Field.ciphertext))
        }
    }
}
