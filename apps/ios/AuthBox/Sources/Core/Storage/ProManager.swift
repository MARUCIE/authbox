import Foundation
import StoreKit

/// Manages Pro upgrade state and StoreKit 2 transactions.
///
/// Free tier: unlimited local passwords, seed phrase, 5 API keys
/// Pro ($29 one-time): multi-device sync, 13 imports, unlimited API keys,
///                     MCP Gateway, Arweave backup, audit log
@MainActor
final class ProManager: ObservableObject {

    static let shared = ProManager()

    static let proProductID = "com.authbox.pro"

    @Published var isPro: Bool = false
    @Published var isLoading: Bool = false

    /// The Pro product fetched from StoreKit. Non-nil once `loadProduct()`
    /// succeeds — the paywall reads its real localized `displayPrice` rather
    /// than hard-coding a string, which doubles as proof that the product
    /// actually loaded (from App Store Connect, or the local .storekit config).
    @Published var product: Product?

    private var updateTask: Task<Void, Never>?

    private init() {
        // Check existing entitlement (cache; StoreKit is the source of truth)
        isPro = UserDefaults.standard.bool(forKey: "authbox_pro_unlocked")

        // Listen for transaction updates
        updateTask = Task {
            await listenForTransactions()
        }

        // Load product + verify entitlement on launch
        Task {
            await loadProduct()
            await verifyEntitlement()
        }
    }

    deinit {
        updateTask?.cancel()
    }

    // MARK: - Products

    /// Fetch the Pro product from StoreKit. Safe to call repeatedly.
    func loadProduct() async {
        if product != nil { return }
        let products = try? await Product.products(for: [Self.proProductID])
        product = products?.first
    }

    /// Real localized price (e.g. "$29.99") once the product loads, else nil.
    var displayPrice: String? { product?.displayPrice }

    // MARK: - Purchase

    func purchase() async throws {
        isLoading = true
        defer { isLoading = false }

        // Reuse the loaded product; fetch on demand if the paywall raced ahead.
        if product == nil { await loadProduct() }
        guard let product else {
            throw ProError.productNotFound
        }

        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await transaction.finish()
            unlock()
        case .userCancelled:
            break
        case .pending:
            break
        @unknown default:
            break
        }
    }

    func restorePurchases() async throws {
        isLoading = true
        defer { isLoading = false }
        try await AppStore.sync()
        await verifyEntitlement()
    }

    // MARK: - Feature Gates

    var maxFreeAPIKeys: Int { 5 }

    func canUseFeature(_ feature: ProFeature) -> Bool {
        if isPro { return true }
        switch feature {
        case .unlimitedAPIKeys, .mcpGateway, .arweaveBackup,
             .multiDeviceSync, .allImports, .auditLog:
            return false
        case .localPasswords, .seedPhrase, .faceID, .appleImport, .passwordGenerator:
            return true
        }
    }

    // MARK: - Private

    private func listenForTransactions() async {
        for await result in Transaction.updates {
            if let transaction = try? checkVerified(result) {
                if transaction.productID == Self.proProductID {
                    unlock()
                }
                await transaction.finish()
            }
        }
    }

    /// Scan StoreKit's current entitlements; unlock if the Pro purchase is
    /// present. `internal` (not `private`) so `@testable` tests can drive the
    /// real entitlement-detection path after seeding a transaction.
    func verifyEntitlement() async {
        for await result in Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result),
               transaction.productID == Self.proProductID {
                unlock()
                return
            }
        }
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let safe):
            return safe
        case .unverified:
            throw ProError.verificationFailed
        }
    }

    /// Flip the entitlement on and persist the cache flag. `internal` so
    /// `@testable` tests can assert the full downstream unlock behavior
    /// (gating matrix + persistence) independent of StoreKit's daemon.
    func unlock() {
        isPro = true
        UserDefaults.standard.set(true, forKey: "authbox_pro_unlocked")
    }
}

// MARK: - Types

enum ProFeature {
    // Free
    case localPasswords
    case seedPhrase
    case faceID
    case appleImport
    case passwordGenerator

    // Pro
    case unlimitedAPIKeys
    case mcpGateway
    case arweaveBackup
    case multiDeviceSync
    case allImports
    case auditLog
}

enum ProError: LocalizedError {
    case productNotFound
    case verificationFailed

    var errorDescription: String? {
        switch self {
        case .productNotFound: "Product not found in App Store"
        case .verificationFailed: "Purchase verification failed"
        }
    }
}
