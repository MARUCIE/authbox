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

    /// iCloud sync orchestration (CKSyncEngine). Built on unlock when sync is enabled,
    /// torn down on lock. Holds the vault key only in memory, like the rest of AppState.
    private var syncEngine: VaultSyncEngine?

    /// Whether zero-knowledge iCloud sync is on. Off by default — the user opts in.
    /// Persisted as a plain bool (it carries no secret). `@Published` so the Settings
    /// toggle observes it; `didSet` persists and starts/stops the engine. The initializer
    /// default does not trigger `didSet`, so the engine is only built on unlock or on an
    /// explicit user toggle — never before the vault key exists.
    private let syncEnabledKey = "authbox.sync.enabled"
    @Published var isSyncEnabled: Bool = UserDefaults.standard.bool(forKey: "authbox.sync.enabled") {
        didSet {
            UserDefaults.standard.set(isSyncEnabled, forKey: syncEnabledKey)
            if isSyncEnabled { startSyncIfEnabled() } else { syncEngine?.stop(); syncEngine = nil }
        }
    }

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

        // UI-test hook: unlocked vault with one login carrying a TOTP secret, so
        // the detail screen shows a live authenticator code. The base32 secret
        // GEZD…OJQ decodes to the RFC 6238 SHA1 seed "12345678901234567890".
        if ProcessInfo.processInfo.arguments.contains("--totp-demo-seed") {
            if vaultState != .unlocked {
                let demoMnemonic =
                    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
                try? createVault(mnemonic: demoMnemonic, masterPassword: "TestPassword123!")
            }
            let demo = VaultItem(
                title: "GitHub",
                username: "alice@acme.com",
                uri: "https://github.com",
                category: .login,
                otpauth: "otpauth://totp/GitHub:alice@acme.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub&digits=6&period=30&algorithm=SHA1"
            )
            addItem(demo)
        }

        // Visual-acceptance hook (WP-021 P4): a populated unlocked vault + wallet so
        // the iPad NavigationSplitView surfaces render with realistic content for
        // screenshots. Pair with --reset-test-vault for a clean slate each launch.
        if ProcessInfo.processInfo.arguments.contains("--ipad-demo-seed") {
            if vaultState != .unlocked {
                let demoMnemonic =
                    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
                try? createVault(mnemonic: demoMnemonic, masterPassword: "TestPassword123!")
            }
            let demos: [VaultItem] = [
                VaultItem(title: "GitHub", username: "alice@acme.com", uri: "https://github.com",
                          category: .login,
                          otpauth: "otpauth://totp/GitHub:alice@acme.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub&digits=6&period=30&algorithm=SHA1"),
                VaultItem(title: "Cloudflare", username: "ops@acme.com", uri: "https://dash.cloudflare.com", category: .login),
                VaultItem(title: "Proton Mail", username: "alice@proton.me", uri: "https://proton.me", category: .login, isFavorite: true),
                VaultItem(title: "AWS Root", username: "root", uri: "https://console.aws.amazon.com", category: .apiKey),
                VaultItem(title: "OpenAI Production Key", username: "sk-prod-•••", category: .apiKey),
                VaultItem(title: "Amex Platinum", username: "•••• 1007", category: .card),
                VaultItem(title: "Recovery Codes", username: "", category: .secureNote),
            ]
            for d in demos { addItem(d) }
            walletAccounts = []
            addWalletAccount(coin: .btc, network: .mainnet, scriptType: .p2wpkh, label: "Cold Storage")
            addWalletAccount(coin: .eth, network: .mainnet, scriptType: .p2wpkh, label: "ENS · main")
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
        syncEngine?.stop()
        syncEngine = nil
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
        syncEngine?.recordLocalUpsert(id: item.id)
    }

    func deleteItem(_ item: VaultItem) {
        vaultItems.removeAll { $0.id == item.id }
        try? store?.delete(item)
        syncEngine?.recordLocalDelete(id: item.id)
    }

    func saveChanges() {
        try? store?.save()
    }

    /// Call after editing an existing item's fields in place, so the change syncs.
    func didEditItem(_ item: VaultItem) {
        syncEngine?.recordLocalUpsert(id: item.id)
    }

    private func loadItems() {
        reloadItemsFromStore()
        startSyncIfEnabled()
    }

    /// Pure reload of the in-memory item list from the local store. Used both at unlock
    /// and after a sync pull applies remote changes — the latter must NOT restart sync.
    private func reloadItemsFromStore() {
        guard let store else { return }
        do {
            vaultItems = try store.fetchAll()
        } catch {
            print("Failed to load vault items: \(error)")
        }
    }

    // MARK: - iCloud Sync

    /// Build and start the sync engine if the user has opted in and the vault is unlocked.
    /// Idempotent: `VaultSyncEngine.start()` no-ops when already running.
    private func startSyncIfEnabled() {
        guard isSyncEnabled, let vaultKey, syncEngine == nil else {
            syncEngine?.start()
            return
        }
        let engine = VaultSyncEngine(vaultKey: vaultKey, backend: self)
        syncEngine = engine
        engine.start()
        // Push everything already on this device so a freshly-enabled account converges.
        engine.enqueueAllLocal(ids: vaultItems.map(\.id))
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

// MARK: - VaultSyncEngine.VaultBackend

extension AppState: VaultSyncEngine.VaultBackend {

    /// Serialize a local item to the same `VaultItemPayload` JSON the sync codec expects.
    /// Returns nil if the item no longer exists locally — the engine then drops the push.
    func localPayloadJSON(for id: UUID) -> String? {
        guard let item = vaultItems.first(where: { $0.id == id }),
              let data = try? JSONEncoder().encode(VaultItemPayload(from: item)) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Apply a pulled item, honoring last-write-wins by `updatedAt`. Mutates the existing
    /// managed object in place when present, otherwise inserts a new one with the id preserved.
    /// Never re-enqueues a push (no CRUD method is called), so pulls can't loop into pushes.
    func applyRemoteUpsert(id: UUID, payloadJSON: String, updatedAt: Date?) {
        guard let payload = try? JSONDecoder().decode(VaultItemPayload.self, from: Data(payloadJSON.utf8)) else { return }
        if let existing = vaultItems.first(where: { $0.id == id }) {
            if let remoteAt = updatedAt, remoteAt < existing.updatedAt { return } // local is newer
            existing.title = payload.title
            existing.username = payload.username
            existing.password = payload.password
            existing.uri = payload.uri
            existing.notes = payload.notes
            existing.category = ItemCategory(rawValue: payload.category) ?? .login
            existing.isFavorite = payload.isFavorite
            existing.otpauth = payload.otpauth
            if let remoteAt = updatedAt { existing.updatedAt = remoteAt }
            try? store?.save()
        } else {
            let item = payload.toVaultItem()
            item.id = id
            if let remoteAt = updatedAt { item.updatedAt = remoteAt }
            try? store?.insert(item)
        }
    }

    func applyRemoteDelete(id: UUID) {
        guard let item = vaultItems.first(where: { $0.id == id }) else { return }
        vaultItems.removeAll { $0.id == id }
        try? store?.delete(item)
    }

    func syncDidApplyRemoteChanges() {
        reloadItemsFromStore()
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
