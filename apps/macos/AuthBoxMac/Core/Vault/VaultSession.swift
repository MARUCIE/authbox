//
//  VaultSession.swift
//  P1 — the lock/unlock state machine. Holds the in-memory vault master key
//  ONLY while unlocked; zeroes it on lock/sleep/idle (auto-lock). Deny-by-default.
//
//  The Touch ID gate IS the Secure Enclave decrypt (unwrap): when a key is
//  provisioned, unlocking decrypts the wrapped master key, which the SE access
//  control gates with biometrics. When no key is provisioned yet (pre-onboarding),
//  a plain biometric check gates the empty state. Either way: no positive auth,
//  no unlock.
//

import Foundation
import Combine
import AuthBoxCrypto
#if canImport(AppKit)
import AppKit
#endif

/// Best-effort secure byte buffer: overwrites its storage on clear. Swift cannot
/// guarantee no copies, but this prevents the key lingering in this allocation.
final class SecureBytes {
    private(set) var bytes: [UInt8]
    init(_ data: Data) { self.bytes = [UInt8](data) }
    var isCleared: Bool { bytes.allSatisfy { $0 == 0 } || bytes.isEmpty }
    func clear() {
        for i in bytes.indices { bytes[i] = 0 }
        bytes.removeAll(keepingCapacity: false)
    }
    deinit { clear() }
}

/// Persists the wrapped (ciphertext) master key. The blob is already encrypted by
/// the Secure Enclave public key, so it is safe at rest; Keychain is its home.
protocol WrappedKeyStore: Sendable {
    func save(_ data: Data) throws
    func load() throws -> Data?
    func clear() throws
}

@MainActor
final class VaultSession: ObservableObject {
    @Published private(set) var isUnlocked = false
    @Published private(set) var lastError: String?

    private let biometric: BiometricAuthenticating
    private let keyWrap: VaultKeyWrapping
    private let wrappedStore: WrappedKeyStore

    private var master: SecureBytes?
    private var authInFlight = false
    private var idleTimer: Timer?
    private var idleTimeout: TimeInterval

    init(biometric: BiometricAuthenticating = LABiometricAuth(),
         keyWrap: VaultKeyWrapping = SecureEnclaveKeyStore(),
         wrappedStore: WrappedKeyStore = KeychainWrappedKeyStore(),
         idleTimeout: TimeInterval = 300) {
        self.biometric = biometric
        self.keyWrap = keyWrap
        self.wrappedStore = wrappedStore
        self.idleTimeout = idleTimeout
        installAutoLockObservers()
    }

    #if DEBUG
    /// Test/diagnostic accessor: the live master key, or nil when locked.
    /// (SEC-003) Compiled only in DEBUG so the release binary exposes no plaintext
    /// master-key getter.
    var masterKeyForTesting: [UInt8]? { master?.bytes }
    #endif

    /// Whether the vault key is currently available, for enabling UI without
    /// vending a copy of the key itself.
    var hasVaultKey: Bool { master != nil }

    /// Borrow the live vault key for the duration of `body`, then zero the
    /// transient copy. (SEC-003) This replaces a `vaultKey: Data?` getter: that
    /// getter handed out a Data copy that lingered un-zeroed in the caller's
    /// allocation until ARC reclaimed it, defeating SecureBytes' zeroing. Returns
    /// nil when locked. Every borrow also counts as activity and re-arms the
    /// auto-lock timer (SEC-009), making the idle timeout activity-based rather
    /// than a fixed countdown from unlock.
    @discardableResult
    func withVaultKey<T>(_ body: (Data) throws -> T) rethrows -> T? {
        guard let master else { return nil }
        armIdleTimer()
        var key = Data(master.bytes)
        defer { key.resetBytes(in: 0..<key.count) }
        return try body(key)
    }

    /// Whether a wrapped master key has been provisioned (vault was set up).
    var isProvisioned: Bool { ((try? wrappedStore.load()) ?? nil) != nil }

    // MARK: - Public API (views call these; they stay synchronous)

    func unlock() { Task { await unlockAsync() } }
    func lock() { performLock() }

    /// Awaitable unlock for tests and call sites that need the result.
    @discardableResult
    func unlockAsync() async -> Bool {
        guard !isUnlocked, !authInFlight else { return isUnlocked }
        authInFlight = true
        defer { authInFlight = false }
        lastError = nil

        if let wrapped = (try? wrappedStore.load()) ?? nil {
            // Provisioned: SE decrypt is the biometric gate.
            do {
                let key = try await keyWrap.unwrap(wrapped: wrapped, reason: "Unlock Auth Box")
                master = SecureBytes(key)
                isUnlocked = true
                armIdleTimer()
                return true
            } catch {
                lastError = "\(error)"   // deny by default
                return false
            }
        } else {
            // Pre-onboarding: no key yet. Gate the empty state with a plain check.
            switch await biometric.authenticate(reason: "Unlock Auth Box") {
            case .success:
                isUnlocked = true
                armIdleTimer()
                return true
            case .failure(let e):
                lastError = "\(e)"
                return false
            }
        }
    }

    /// Provision the vault master key (called by onboarding in P2 with a
    /// seed-derived key). Wraps it via the Secure Enclave and persists the blob.
    func provision(masterKey: Data) throws {
        try keyWrap.provisionIfNeeded()
        let wrapped = try keyWrap.wrap(masterKey: masterKey)
        try wrappedStore.save(wrapped)
    }

    /// Onboarding: derive the vault key from a BIP-39 mnemonic, wrap it in the
    /// Secure Enclave, persist the wrapped blob, and enter the unlocked state.
    /// The mnemonic itself is NEVER stored — it is the user's offline recovery.
    @discardableResult
    func provisionAndUnlock(mnemonic: String) throws -> Bool {
        // SEC-008: zero the derived seed once the keys are extracted. The seed is
        // the root of all derived keys; it must not linger in this allocation
        // after provisioning. (The mnemonic String stays the user's offline
        // recovery and is never persisted; the master key lives in SecureBytes,
        // which zeroes on clear.)
        var seed = Seed.mnemonicToSeed(mnemonic)
        defer { seed.resetBytes(in: 0..<seed.count) }
        let keys = Seed.deriveAllKeys(seed: seed)
        try provision(masterKey: keys.vaultKey)
        master = SecureBytes(keys.vaultKey)
        isUnlocked = true
        armIdleTimer()
        return true
    }

    func resetVault() throws {
        performLock()
        try wrappedStore.clear()
    }

    // MARK: - Lock + auto-lock

    private func performLock() {
        master?.clear()
        master = nil
        isUnlocked = false
        idleTimer?.invalidate()
        idleTimer = nil
    }

    private func armIdleTimer() {
        idleTimer?.invalidate()
        guard idleTimeout > 0 else { return }
        idleTimer = Timer.scheduledTimer(withTimeInterval: idleTimeout, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.performLock() }
        }
    }

    private func installAutoLockObservers() {
        #if canImport(AppKit)
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.performLock() }
        }
        // Screen locked (screensaver / lock screen).
        DistributedNotificationCenter.default().addObserver(
            forName: Notification.Name("com.apple.screenIsLocked"), object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.performLock() }
        }
        #endif
    }
}

/// Keychain-backed wrapped-key store (generic password, device-local).
struct KeychainWrappedKeyStore: WrappedKeyStore {
    private let account = "com.authbox.mac.wrapped-master-key"
    private let service = "com.authbox.mac.vault"

    private func baseQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func save(_ data: Data) throws {
        var q = baseQuery()
        SecItemDelete(q as CFDictionary)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(q as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.wrapFailed("SecItemAdd \(status)") }
    }

    func load() throws -> Data? {
        var q = baseQuery()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        switch status {
        case errSecSuccess: return item as? Data
        case errSecItemNotFound: return nil
        default: throw KeychainError.unwrapFailed("SecItemCopyMatching \(status)")
        }
    }

    func clear() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unwrapFailed("SecItemDelete \(status)")
        }
    }
}
