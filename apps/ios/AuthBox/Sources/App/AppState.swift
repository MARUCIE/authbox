import Foundation
import SwiftData
import SwiftUI
import AuthBoxCrypto

/// Root application state managing vault lifecycle.
@MainActor
final class AppState: ObservableObject {

    enum VaultState {
        case locked
        case unlocked
        case empty
    }

    @Published var vaultState: VaultState = .empty
    @Published var vaultItems: [VaultItem] = []

    /// In-memory vault key (never persisted to disk).
    private var vaultKey: Data?

    /// In-memory seed (never persisted to disk).
    private var seed: Data?

    /// Local vault store (SwiftData).
    private var store: VaultStore?

    init() {
        let resetForUITests = ProcessInfo.processInfo.arguments.contains("--reset-test-vault")
        if resetForUITests {
            KeychainManager.deleteSeed()
        }

        if KeychainManager.hasSeed() {
            vaultState = .locked
        } else {
            vaultState = .empty
        }

        // Initialize SwiftData store
        do {
            store = try VaultStore()
            if resetForUITests {
                try store?.deleteAll()
            }
        } catch {
            print("VaultStore init failed: \(error)")
        }
    }

    // MARK: - Vault Lifecycle

    func createVault(mnemonic: String, masterPassword: String) throws {
        let seed = Seed.mnemonicToSeed(mnemonic)
        let keys = Seed.deriveAllKeys(seed: seed)

        try KeychainManager.storeSeed(seed)

        self.seed = seed
        self.vaultKey = keys.vaultKey
        self.vaultState = .unlocked
        loadItems()
    }

    func unlockVault(withBiometrics biometricSeed: Data) throws {
        let keys = Seed.deriveAllKeys(seed: biometricSeed)
        self.seed = biometricSeed
        self.vaultKey = keys.vaultKey
        self.vaultState = .unlocked
        loadItems()
    }

    func lockVault() {
        vaultKey = nil
        seed = nil
        vaultItems = []
        vaultState = KeychainManager.hasSeed() ? .locked : .empty
    }

    func restoreFromMnemonic(_ mnemonic: String) throws {
        guard Seed.validateMnemonic(mnemonic) else {
            throw AuthBoxError.invalidMnemonic
        }
        let seed = Seed.mnemonicToSeed(mnemonic)
        try KeychainManager.storeSeed(seed)
        let keys = Seed.deriveAllKeys(seed: seed)
        self.seed = seed
        self.vaultKey = keys.vaultKey
        self.vaultState = .unlocked
        loadItems()
    }

    // MARK: - CRUD

    func addItem(_ item: VaultItem) {
        vaultItems.append(item)
        try? store?.insert(item)
    }

    func deleteItem(_ item: VaultItem) {
        vaultItems.removeAll { $0.id == item.id }
        try? store?.delete(item)
    }

    func saveChanges() {
        try? store?.save()
    }

    private func loadItems() {
        guard let store else { return }
        do {
            vaultItems = try store.fetchAll()
        } catch {
            print("Failed to load vault items: \(error)")
        }
    }

    // MARK: - Password Generation

    func derivePassword(site: String, options: DerivePasswordOptions = .init()) -> String? {
        guard let seed else { return nil }
        return Seed.derivePassword(seed: seed, site: site, options: options)
    }
}

// MARK: - Errors

enum AuthBoxError: LocalizedError {
    case invalidMnemonic
    case vaultLocked
    case keychainError(String)

    var errorDescription: String? {
        switch self {
        case .invalidMnemonic: "Invalid seed phrase"
        case .vaultLocked: "Vault is locked"
        case .keychainError(let msg): "Keychain error: \(msg)"
        }
    }
}
