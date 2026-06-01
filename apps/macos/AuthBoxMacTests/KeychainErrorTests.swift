//
//  KeychainErrorTests.swift
//  Pins the user-facing error contract: a raw OSStatus (notably -34018, the
//  unsigned-build Secure Enclave failure) must surface as actionable text, never
//  as the leaked enum case. This is the only headless-testable part of the SE path.
//

import XCTest
@testable import AuthBoxMac

final class KeychainErrorTests: XCTestCase {

    func test_minus34018_yields_signing_guidance_not_raw_enum() {
        let msg = KeychainError
            .keyCreationFailed("The operation couldn't be completed. (OSStatus error -34018 - …)")
            .localizedDescription
        XCTAssertTrue(msg.contains("development team"), "should explain the cause")
        XCTAssertTrue(msg.contains("Xcode"), "should tell the user where to act")
        XCTAssertFalse(msg.contains("keyCreationFailed"), "must not leak the enum case")
    }

    func test_entitlement_wording_also_maps_to_signing_guidance() {
        let msg = KeychainError.keyCreationFailed("missing entitlement").localizedDescription
        XCTAssertTrue(msg.contains("development team"))
    }

    func test_unrelated_detail_is_passed_through_without_signing_claim() {
        let msg = KeychainError.keyCreationFailed("enclave busy").localizedDescription
        XCTAssertTrue(msg.contains("enclave busy"))
        XCTAssertFalse(msg.contains("development team"), "must not misattribute unrelated failures")
    }

    func test_notProvisioned_is_friendly() {
        XCTAssertEqual(KeychainError.notProvisioned.localizedDescription,
                       "No vault has been set up on this device yet.")
    }
}
