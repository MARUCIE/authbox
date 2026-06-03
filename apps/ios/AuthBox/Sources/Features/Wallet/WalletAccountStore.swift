import Foundation

/// A saved wallet account. This is PUBLIC metadata only — it records which
/// derivation path the user added (coin / network / script type / account
/// index / label). It holds no keys and no addresses; the receive address is
/// re-derived live from the in-memory seed whenever the vault is unlocked. That
/// keeps the persisted footprint free of anything sensitive, so plain
/// UserDefaults is an acceptable home for it.
struct WalletAccountDescriptor: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var coin: String        // "btc" | "eth"
    var network: String     // "mainnet" | "testnet"
    var scriptType: String  // "p2wpkh" | "p2pkh"  (ignored for ETH)
    var accountIndex: Int
    var label: String
}

/// UserDefaults-backed persistence for the public account descriptors.
enum WalletAccountStore {
    private static let key = "authbox.wallet.accounts.v1"

    static func load() -> [WalletAccountDescriptor] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let list = try? JSONDecoder().decode([WalletAccountDescriptor].self, from: data)
        else { return [] }
        return list
    }

    static func save(_ accounts: [WalletAccountDescriptor]) {
        if let data = try? JSONEncoder().encode(accounts) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
