//
//  VaultSessionTests.swift
//  P1 — headless tests for the lock/unlock state machine + master-key zeroing.
//  Hardware seams (LAContext, Secure Enclave) are injected as fakes; the real
//  Touch ID round-trip is a manual UX gate on the Mac (cannot run headless).
//

import XCTest
@testable import AuthBoxMac

// MARK: - Injected fakes (hardware seams only)

private struct FakeBiometric: BiometricAuthenticating {
    let ok: Bool
    func authenticate(reason: String) async -> Result<Void, AuthError> {
        ok ? .success(()) : .failure(.userCancelled)
    }
    func availability() -> Result<Void, AuthError> {
        ok ? .success(()) : .failure(.biometryUnavailable)
    }
}

private struct FakeKeyWrap: VaultKeyWrapping {
    let provisioned: Bool
    let unwrapSucceeds: Bool
    let returnedKey: Data
    func wrap(masterKey: Data) throws -> Data { masterKey }
    func unwrap(wrapped: Data, reason: String) async throws -> Data {
        if unwrapSucceeds { return returnedKey }
        throw KeychainError.unwrapFailed("test-denied")
    }
    func isProvisioned() -> Bool { provisioned }
    func provisionIfNeeded() throws {}
}

private final class InMemoryWrappedKeyStore: WrappedKeyStore, @unchecked Sendable {
    var blob: Data?
    init(_ blob: Data?) { self.blob = blob }
    func save(_ data: Data) throws { blob = data }
    func load() throws -> Data? { blob }
    func clear() throws { blob = nil }
}

@MainActor
final class VaultSessionTests: XCTestCase {

    private let key32 = Data(repeating: 0xAB, count: 32)

    func test_unlock_provisioned_success_holds_masterKey() async {
        let s = VaultSession(
            biometric: FakeBiometric(ok: true),
            keyWrap: FakeKeyWrap(provisioned: true, unwrapSucceeds: true, returnedKey: key32),
            wrappedStore: InMemoryWrappedKeyStore(Data(repeating: 0x01, count: 16)),
            idleTimeout: 0
        )
        let ok = await s.unlockAsync()
        XCTAssertTrue(ok)
        XCTAssertTrue(s.isUnlocked)
        XCTAssertEqual(s.masterKeyForTesting, [UInt8](key32))
    }

    func test_lock_zeroes_masterKey() async {
        let s = VaultSession(
            biometric: FakeBiometric(ok: true),
            keyWrap: FakeKeyWrap(provisioned: true, unwrapSucceeds: true, returnedKey: key32),
            wrappedStore: InMemoryWrappedKeyStore(Data(repeating: 0x01, count: 16)),
            idleTimeout: 0
        )
        _ = await s.unlockAsync()
        XCTAssertNotNil(s.masterKeyForTesting)
        s.lock()
        XCTAssertFalse(s.isUnlocked)
        XCTAssertNil(s.masterKeyForTesting, "master key must be released on lock")
    }

    func test_unlock_denied_on_unwrap_failure_stays_locked() async {
        let s = VaultSession(
            biometric: FakeBiometric(ok: true),
            keyWrap: FakeKeyWrap(provisioned: true, unwrapSucceeds: false, returnedKey: key32),
            wrappedStore: InMemoryWrappedKeyStore(Data(repeating: 0x01, count: 16)),
            idleTimeout: 0
        )
        let ok = await s.unlockAsync()
        XCTAssertFalse(ok, "deny-by-default: failed unwrap must not unlock")
        XCTAssertFalse(s.isUnlocked)
        XCTAssertNil(s.masterKeyForTesting)
        XCTAssertNotNil(s.lastError)
    }

    func test_unlock_preonboarding_uses_biometric_gate() async {
        let pass = VaultSession(
            biometric: FakeBiometric(ok: true),
            keyWrap: FakeKeyWrap(provisioned: false, unwrapSucceeds: false, returnedKey: key32),
            wrappedStore: InMemoryWrappedKeyStore(nil),
            idleTimeout: 0
        )
        let passUnlocked = await pass.unlockAsync()
        XCTAssertTrue(passUnlocked)
        XCTAssertTrue(pass.isUnlocked)
        XCTAssertNil(pass.masterKeyForTesting, "no key provisioned yet → empty unlocked state")

        let fail = VaultSession(
            biometric: FakeBiometric(ok: false),
            keyWrap: FakeKeyWrap(provisioned: false, unwrapSucceeds: false, returnedKey: key32),
            wrappedStore: InMemoryWrappedKeyStore(nil),
            idleTimeout: 0
        )
        let failUnlocked = await fail.unlockAsync()
        XCTAssertFalse(failUnlocked)
        XCTAssertFalse(fail.isUnlocked)
    }
}
