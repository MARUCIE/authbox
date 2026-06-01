//
//  VaultServiceTests.swift
//  P2 — headless tests for the encrypt → store → reveal round-trip and the
//  password generator. Uses an in-memory SwiftData store and a real vault key
//  from AuthBoxCrypto; no hardware seams are involved here.
//

import XCTest
import AuthBoxCrypto
@testable import AuthBoxMac

@MainActor
final class VaultServiceTests: XCTestCase {

    private func makeService() throws -> VaultService {
        VaultService(store: try VaultStore(inMemory: true))
    }

    func test_add_then_reveal_round_trips_secret() throws {
        let svc = try makeService()
        let key = VaultCrypto.generateVaultKey()
        let secret = VaultSecret(secret: "hunter2-correct-horse", notes: "prod login")

        let item = try svc.add(title: "GitHub", username: "marucie",
                               urlString: "https://github.com", secret: secret, vaultKey: key)
        let revealed = try svc.reveal(item.id, vaultKey: key)

        XCTAssertEqual(revealed, secret, "decrypted secret must equal the original")
        XCTAssertEqual(try svc.list().count, 1)
    }

    func test_reveal_with_wrong_key_throws() throws {
        let svc = try makeService()
        let key = VaultCrypto.generateVaultKey()
        let wrongKey = VaultCrypto.generateVaultKey()
        let item = try svc.add(title: "AWS", secret: VaultSecret(secret: "AKIA-redacted"), vaultKey: key)

        XCTAssertThrowsError(try svc.reveal(item.id, vaultKey: wrongKey),
                             "GCM tag must reject decryption under a different key")
    }

    func test_update_secret_changes_revealed_value() throws {
        let svc = try makeService()
        let key = VaultCrypto.generateVaultKey()
        let item = try svc.add(title: "Mail", secret: VaultSecret(secret: "old-pw"), vaultKey: key)

        try svc.updateSecret(item.id, secret: VaultSecret(secret: "new-pw"), vaultKey: key)
        XCTAssertEqual(try svc.reveal(item.id, vaultKey: key).secret, "new-pw")
    }

    func test_delete_removes_item() throws {
        let svc = try makeService()
        let key = VaultCrypto.generateVaultKey()
        let item = try svc.add(title: "Temp", secret: VaultSecret(secret: "x"), vaultKey: key)
        XCTAssertEqual(try svc.list().count, 1)

        try svc.delete(item.id)
        XCTAssertTrue(try svc.list().isEmpty)
        XCTAssertThrowsError(try svc.reveal(item.id, vaultKey: key))
    }

    func test_reveal_unknown_id_throws_notFound() throws {
        let svc = try makeService()
        let key = VaultCrypto.generateVaultKey()
        XCTAssertThrowsError(try svc.reveal(UUID(), vaultKey: key)) { error in
            XCTAssertEqual(error as? VaultServiceError, .notFound)
        }
    }

    // MARK: - Password generator

    func test_random_generator_respects_length_and_charset() {
        let opts = PasswordGenerator.Options(length: 24, lowercase: true, uppercase: false,
                                             digits: false, symbols: false)
        let pw = PasswordGenerator.random(opts)
        XCTAssertEqual(pw.count, 24)
        XCTAssertTrue(pw.allSatisfy { PasswordGenerator.lower.contains($0) },
                      "only lowercase requested → only lowercase emitted")
    }

    func test_deterministic_generator_is_reproducible_and_site_scoped() {
        let seed = Data(repeating: 0x7A, count: 32)
        let a1 = PasswordGenerator.deterministic(seed: seed, site: "github.com")
        let a2 = PasswordGenerator.deterministic(seed: seed, site: "github.com")
        let b = PasswordGenerator.deterministic(seed: seed, site: "gitlab.com")

        XCTAssertEqual(a1, a2, "same seed + same site → identical password")
        XCTAssertNotEqual(a1, b, "different site → different password")
        XCTAssertFalse(a1.isEmpty)
    }
}
