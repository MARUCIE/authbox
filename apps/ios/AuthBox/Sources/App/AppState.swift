import Foundation
import SwiftData
import SwiftUI
import BigInt
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

    /// DEBUG visual-acceptance seam: when set, `ContentView` presents the Send
    /// sheet straight at the root for a no-tap screenshot of the Send flow. Only
    /// ever written under the `--send-demo-testnet` launch arg (`#if DEBUG`); it
    /// stays nil in release, so the root never deviates from the normal vault UI.
    @Published var pendingSendDemo: WalletAccountDescriptor?

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

        // Visual-acceptance hook: boot straight into the Send sheet on a TESTNET
        // BTC account whose receive address is the funded shared-pot
        // (tb1q6rz28…). ContentView presents SendWalletView at the root with the
        // recipient + amount prefilled and auto-review on, so a single launch
        // exercises the live testnet tx-prep → on-device build+sign path (NO
        // broadcast) and renders the real fee/txid for a no-tap screenshot.
        if ProcessInfo.processInfo.arguments.contains("--send-demo-testnet") {
            if vaultState != .unlocked {
                let demoMnemonic =
                    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
                try? createVault(mnemonic: demoMnemonic, masterPassword: "TestPassword123!")
            }
            walletAccounts = []
            addWalletAccount(coin: .btc, network: .testnet, scriptType: .p2wpkh, label: "Testnet · shared pot")
            pendingSendDemo = walletAccounts.first
        }

        // Same seam for the ETH path. An ETH build needs only the live nonce +
        // gas price (no UTXOs), so the Review populates deterministically against
        // Sepolia even at zero balance — proving the ETH signer's UI path.
        if ProcessInfo.processInfo.arguments.contains("--send-demo-eth-testnet") {
            if vaultState != .unlocked {
                let demoMnemonic =
                    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
                try? createVault(mnemonic: demoMnemonic, masterPassword: "TestPassword123!")
            }
            walletAccounts = []
            addWalletAccount(coin: .eth, network: .testnet, scriptType: .p2wpkh, label: "Sepolia · demo")
            pendingSendDemo = walletAccounts.first
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

    // MARK: - Wallet Send (build + sign client-side, then relay)

    /// Build and sign a send transaction CLIENT-SIDE WITHOUT broadcasting. The
    /// private key is derived from the in-memory seed inside AuthBoxCrypto.WalletTx
    /// and never leaves it; this returns a preview the user reviews before the
    /// explicit broadcast step — the mainnet money-movement gate. Tx-prep reads and
    /// the eventual relay go straight to public explorers (local-first, like
    /// WalletBalanceService); the server is never involved.
    func walletPrepareSend(descriptor: WalletAccountDescriptor,
                           toAddress: String,
                           amountInput: String) async throws -> WalletSendPreview {
        guard let seed else { throw WalletSendError.locked }
        let coin = descriptor.coin
        let network = descriptor.network
        let walletNet = Wallet.WalletNetwork(rawValue: network) ?? .mainnet
        let to = toAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !to.isEmpty else { throw WalletSendError.invalidAddress }
        let svc = WalletTxPrepService()

        if coin == "btc" {
            guard let satsStr = WalletAmount.parseSmallest(amountInput, decimals: 8),
                  let amountSats = UInt64(satsStr) else { throw WalletSendError.invalidAmount }
            guard let receive = walletReceiveAddress(for: descriptor)?.address else { throw WalletSendError.locked }
            let utxos = try await svc.btcUTXOs(network: network, address: receive, accountIndex: descriptor.accountIndex)
            guard !utxos.isEmpty else { throw WalletSendError.noFunds }
            let fees = try await svc.btcFees(network: network)
            let feeRate = max(fees.halfHourFee, fees.minimumFee)   // "normal" tier, floored at the relay minimum
            do {
                // Change returns to the account's own receive address — the iOS app
                // uses a single address per account, so this avoids tracking a
                // separate change branch while staying fully self-custodial.
                let signed = try WalletTx.buildBtcTransaction(seed: seed, params: WalletTx.BuildBtcTxParams(
                    utxos: utxos, to: to, amountSats: amountSats, changeAddress: receive,
                    feeRateSatPerVb: feeRate, network: walletNet))
                return WalletSendPreview(
                    coin: coin, network: network, toAddress: to,
                    amountDisplay: WalletAmount.formatUnits(satsStr, decimals: 8) + " BTC",
                    feeDisplay: WalletAmount.formatUnits(String(signed.fee), decimals: 8) + " BTC",
                    totalDisplay: WalletAmount.formatUnits(String(amountSats + signed.fee), decimals: 8) + " BTC",
                    signedHex: signed.hex, txid: signed.txid)
            } catch let e as WalletTx.BtcTxError {
                throw mapBtcError(e)
            }
        } else {
            guard let weiStr = WalletAmount.parseSmallest(amountInput, decimals: 18),
                  let amountWei = BigUInt(weiStr) else { throw WalletSendError.invalidAmount }
            guard let sender = walletReceiveAddress(for: descriptor)?.address else { throw WalletSendError.locked }
            let nonce = try await svc.ethNonce(network: network, address: sender)
            let (gasPrice, priority) = try await svc.ethGas(network: network)
            let maxFee = gasPrice + priority
            let gasLimit = BigUInt(21000)
            let chainId: BigUInt = network == "testnet" ? 11_155_111 : 1
            do {
                let signed = try WalletTx.buildEthTransaction(seed: seed, params: WalletTx.BuildEthTxParams(
                    to: to, amountWei: amountWei, nonce: nonce, gasLimit: gasLimit,
                    maxFeePerGas: maxFee, maxPriorityFeePerGas: priority, chainId: chainId,
                    account: descriptor.accountIndex, network: walletNet))
                let feeWei = maxFee * gasLimit
                return WalletSendPreview(
                    coin: coin, network: network, toAddress: to,
                    amountDisplay: WalletAmount.formatUnits(weiStr, decimals: 18) + " ETH",
                    feeDisplay: WalletAmount.formatUnits(String(feeWei), decimals: 18) + " ETH",
                    totalDisplay: WalletAmount.formatUnits(String(amountWei + feeWei), decimals: 18) + " ETH",
                    signedHex: signed.hex, txid: signed.hash)
            } catch let e as WalletTx.WalletTxError {
                switch e {
                case .invalidRecipient: throw WalletSendError.invalidAddress
                case .signingFailed, .senderMismatch: throw WalletSendError.signingFailed("Transaction signing failed.")
                }
            }
        }
    }

    /// Relay a previously-built, user-confirmed signed transaction. Returns the txid.
    func walletBroadcast(_ preview: WalletSendPreview) async throws -> String {
        let svc = WalletTxPrepService()
        if preview.coin == "btc" {
            return try await svc.broadcastBtc(network: preview.network, rawTxHex: preview.signedHex)
        }
        return try await svc.broadcastEth(network: preview.network, rawTxHex: preview.signedHex)
    }

    private func mapBtcError(_ e: WalletTx.BtcTxError) -> WalletSendError {
        switch e {
        case .noUtxos: return .noFunds
        case .insufficientFunds: return .insufficientFunds
        case .badAmount: return .invalidAmount
        case .badFeeRate: return .signingFailed("Invalid fee rate from the explorer.")
        case .badAddress: return .invalidAddress
        }
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
