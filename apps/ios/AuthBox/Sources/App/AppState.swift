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

    /// Public wallet account descriptors (no keys). Persisted via UserDefaults.
    @Published var walletAccounts: [WalletAccountDescriptor] = []

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
            WalletAccountStore.save([])
        }

        #if DEBUG
        // UI-test hook: clear the cached Pro entitlement so the paywall starts
        // from the free state. StoreKit's currentEntitlements remains the real
        // source of truth; this only resets the local cache flag.
        if ProcessInfo.processInfo.arguments.contains("--reset-pro") {
            UserDefaults.standard.removeObject(forKey: "authbox_pro_unlocked")
            ProManager.shared.isPro = false
        }
        #endif

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

        // Wallet account descriptors are public metadata — safe to load eagerly.
        walletAccounts = WalletAccountStore.load()

        #if DEBUG
        // UI-test hook: boot straight into an unlocked vault derived from the
        // public all-zeros BIP-39 test mnemonic, so wallet screens show the
        // canonical (and real-on-chain) addresses without driving onboarding.
        if ProcessInfo.processInfo.arguments.contains("--wallet-demo-seed") {
            let demoMnemonic =
                "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
            try? createVault(mnemonic: demoMnemonic, masterPassword: "TestPassword123!")
        }
        #endif
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

    // MARK: - Wallet

    /// Add a watch-only wallet account. The descriptor is public; the address is
    /// derived live and never persisted.
    func addWalletAccount(coin: Wallet.Coin, network: Wallet.WalletNetwork,
                          scriptType: Wallet.BtcScriptType, label: String) {
        let nextIndex = walletAccounts
            .filter { $0.coin == coin.rawValue && $0.network == network.rawValue }
            .map(\.accountIndex)
            .max().map { $0 + 1 } ?? 0
        let descriptor = WalletAccountDescriptor(
            coin: coin.rawValue,
            network: network.rawValue,
            scriptType: coin == .btc ? scriptType.rawValue : Wallet.BtcScriptType.p2wpkh.rawValue,
            accountIndex: nextIndex,
            label: label.isEmpty ? defaultLabel(coin: coin, index: nextIndex) : label
        )
        walletAccounts.append(descriptor)
        WalletAccountStore.save(walletAccounts)
    }

    func removeWalletAccount(_ descriptor: WalletAccountDescriptor) {
        walletAccounts.removeAll { $0.id == descriptor.id }
        WalletAccountStore.save(walletAccounts)
    }

    /// Derive the first receive address for an account. Returns nil when locked.
    func walletReceiveAddress(for descriptor: WalletAccountDescriptor) -> Wallet.WalletAddress? {
        guard let seed, let coin = Wallet.Coin(rawValue: descriptor.coin) else { return nil }
        return Wallet.deriveAddress(seed: seed, coin: coin, options: deriveOptions(for: descriptor))
    }

    /// Account-level xpub (watch-only). Returns nil when locked.
    func walletAccountXpub(for descriptor: WalletAccountDescriptor) -> String? {
        guard let seed, let coin = Wallet.Coin(rawValue: descriptor.coin) else { return nil }
        return Wallet.deriveAccount(seed: seed, coin: coin, options: deriveOptions(for: descriptor)).xpub
    }

    private func deriveOptions(for descriptor: WalletAccountDescriptor) -> Wallet.DeriveOptions {
        Wallet.DeriveOptions(
            account: descriptor.accountIndex,
            change: 0,
            index: 0,
            scriptType: Wallet.BtcScriptType(rawValue: descriptor.scriptType) ?? .p2wpkh,
            network: Wallet.WalletNetwork(rawValue: descriptor.network) ?? .mainnet
        )
    }

    private func defaultLabel(coin: Wallet.Coin, index: Int) -> String {
        let name = coin == .btc ? "Bitcoin" : "Ethereum"
        return index == 0 ? name : "\(name) \(index + 1)"
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
