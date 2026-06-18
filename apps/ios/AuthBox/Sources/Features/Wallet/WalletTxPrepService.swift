import Foundation
import BigInt
import AuthBoxCrypto

/// Local-first transaction preparation + broadcast, straight from public block
/// explorers — the same indexers `WalletBalanceService` and the Go
/// `txprep_provider.go` use (mempool.space for BTC, publicnode RPC for ETH).
///
/// Only PUBLIC addresses and ALREADY-SIGNED raw transactions ever leave the
/// device: every transaction is assembled and signed locally in
/// `AuthBoxCrypto.WalletTx`, and the private key never touches this service. The
/// server is bypassed entirely, keeping the wallet local-first and consistent
/// with `WalletBalanceService` (the vault never round-trips through a server
/// either). The broadcast endpoints are the public nodes' own relays, so a
/// signed payload is forwarded exactly as the Go API would have forwarded it.
struct WalletTxPrepService {

    enum TxPrepError: LocalizedError {
        case unsupportedNetwork
        case badResponse
        case rpcError(String)
        case broadcastRejected(String)
        var errorDescription: String? {
            switch self {
            case .unsupportedNetwork: "Unsupported network"
            case .badResponse: "Unexpected response from the block explorer"
            case .rpcError(let m): "RPC error: \(m)"
            case .broadcastRejected(let m): "Broadcast rejected: \(m)"
            }
        }
    }

    /// mempool.space recommended sat/vB tiers.
    struct BtcFeeTiers: Sendable {
        let fastestFee: Int
        let halfHourFee: Int
        let hourFee: Int
        let economyFee: Int
        let minimumFee: Int
    }

    private static let btcBase: [String: String] = [
        "mainnet": "https://mempool.space/api",
        "testnet": "https://mempool.space/testnet/api",
    ]
    private static let ethBase: [String: String] = [
        "mainnet": "https://ethereum-rpc.publicnode.com",
        "testnet": "https://ethereum-sepolia-rpc.publicnode.com",
    ]

    /// 1.5 gwei — the same priority-fee floor the Go provider falls back to when
    /// the node lacks a dedicated suggestion RPC.
    static let defaultPriorityFeeWei = BigUInt(1_500_000_000)

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 20
        return URLSession(configuration: cfg)
    }()

    // MARK: - BTC reads

    /// Confirmed spendable outputs for the account's receive address. Every UTXO
    /// is tagged with that address's derivation coords (change 0 / index 0) so
    /// `WalletTx.buildBtcTransaction` can re-derive the signing key.
    func btcUTXOs(network: String, address: String, accountIndex: Int) async throws -> [WalletTx.BtcSpendableUtxo] {
        guard let base = Self.btcBase[network],
              let url = URL(string: "\(base)/address/\(address)/utxo") else {
            throw TxPrepError.unsupportedNetwork
        }
        let (data, response) = try await session.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw TxPrepError.badResponse }

        struct Status: Decodable { let confirmed: Bool }
        struct Utxo: Decodable { let txid: String; let vout: Int; let value: UInt64; let status: Status }
        let utxos = try JSONDecoder().decode([Utxo].self, from: data)

        return utxos
            .filter { $0.status.confirmed }   // only spend confirmed value
            .map { WalletTx.BtcSpendableUtxo(txid: $0.txid, vout: UInt32($0.vout), value: $0.value,
                                             account: accountIndex, change: 0, index: 0) }
    }

    /// Recommended fee tiers. mempool.space testnet `/v1/fees/recommended` is
    /// frequently 503, so testnet falls back to the mainnet tiers (sat/vB rates
    /// are network-independent) — the same fallback the Go provider does.
    func btcFees(network: String) async throws -> BtcFeeTiers {
        do {
            return try await fetchBtcFees(network: network)
        } catch {
            if network != "mainnet" { return try await fetchBtcFees(network: "mainnet") }
            throw error
        }
    }

    private func fetchBtcFees(network: String) async throws -> BtcFeeTiers {
        guard let base = Self.btcBase[network],
              let url = URL(string: "\(base)/v1/fees/recommended") else {
            throw TxPrepError.unsupportedNetwork
        }
        let (data, response) = try await session.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw TxPrepError.badResponse }
        struct Tiers: Decodable {
            let fastestFee: Int; let halfHourFee: Int; let hourFee: Int
            let economyFee: Int; let minimumFee: Int
        }
        let t = try JSONDecoder().decode(Tiers.self, from: data)
        return BtcFeeTiers(fastestFee: t.fastestFee, halfHourFee: t.halfHourFee,
                           hourFee: t.hourFee, economyFee: t.economyFee, minimumFee: t.minimumFee)
    }

    // MARK: - ETH reads

    /// Pending transaction count = the nonce for the next transaction.
    func ethNonce(network: String, address: String) async throws -> BigUInt {
        let hex = try await ethCall(network: network, method: "eth_getTransactionCount",
                                    params: [address.lowercased(), "pending"])
        return bigUInt(fromHex: hex)
    }

    /// Current base gas price plus the default priority-fee floor (wei).
    func ethGas(network: String) async throws -> (gasPriceWei: BigUInt, priorityFeeWei: BigUInt) {
        let hex = try await ethCall(network: network, method: "eth_gasPrice", params: [])
        return (bigUInt(fromHex: hex), Self.defaultPriorityFeeWei)
    }

    // MARK: - Broadcast

    /// Relay a signed BTC raw transaction via mempool.space; returns the txid.
    func broadcastBtc(network: String, rawTxHex: String) async throws -> String {
        guard let base = Self.btcBase[network], let url = URL(string: "\(base)/tx") else {
            throw TxPrepError.unsupportedNetwork
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("text/plain", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data(rawTxHex.utf8)
        let (data, response) = try await session.data(for: req)
        let body = String(data: data, encoding: .utf8) ?? ""
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw TxPrepError.broadcastRejected(body)
        }
        return body.trimmingCharacters(in: .whitespacesAndNewlines)   // mempool returns the bare txid
    }

    /// Relay a signed ETH raw transaction via publicnode JSON-RPC; returns the tx hash.
    func broadcastEth(network: String, rawTxHex: String) async throws -> String {
        let hex = rawTxHex.hasPrefix("0x") ? rawTxHex : "0x" + rawTxHex
        return try await ethCall(network: network, method: "eth_sendRawTransaction", params: [hex])
    }

    // MARK: - ETH JSON-RPC

    private func ethCall(network: String, method: String, params: [String]) async throws -> String {
        guard let base = Self.ethBase[network], let url = URL(string: base) else {
            throw TxPrepError.unsupportedNetwork
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let paramsJSON = params.map { "\"\($0)\"" }.joined(separator: ",")
        req.httpBody = Data(#"{"jsonrpc":"2.0","method":"\#(method)","params":[\#(paramsJSON)],"id":1}"#.utf8)

        let (data, response) = try await session.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw TxPrepError.badResponse }
        struct RPC: Decodable { let result: String?; let error: RPCError? }
        struct RPCError: Decodable { let message: String }
        let rpc = try JSONDecoder().decode(RPC.self, from: data)
        if let e = rpc.error { throw TxPrepError.rpcError(e.message) }
        guard let result = rpc.result else { throw TxPrepError.badResponse }
        return result
    }

    private func bigUInt(fromHex hex: String) -> BigUInt {
        let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        return BigUInt(clean, radix: 16) ?? 0
    }
}
