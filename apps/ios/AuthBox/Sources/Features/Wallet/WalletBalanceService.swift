import Foundation

/// Watch-only balance lookup, straight from public block explorers — the same
/// indexers the Go `balance_provider.go` uses (mempool.space for BTC,
/// publicnode RPC for ETH). Only PUBLIC addresses leave the device; no key
/// material is ever involved, so this egress carries no exfiltration risk. This
/// keeps the iOS wallet local-first and consistent with the rest of the app
/// (the vault never round-trips through the server either).
struct WalletBalanceService {

    struct Balance: Sendable {
        let confirmed: String   // smallest unit (sats / wei), decimal string
        let unconfirmed: String
    }

    enum BalanceError: LocalizedError {
        case unsupportedNetwork
        case badResponse
        case rpcError(String)
        var errorDescription: String? {
            switch self {
            case .unsupportedNetwork: "Unsupported network"
            case .badResponse: "Unexpected response from the block explorer"
            case .rpcError(let m): "RPC error: \(m)"
            }
        }
    }

    private static let btcBase: [String: String] = [
        "mainnet": "https://mempool.space/api",
        "testnet": "https://mempool.space/testnet/api",
    ]
    private static let ethBase: [String: String] = [
        "mainnet": "https://ethereum-rpc.publicnode.com",
        "testnet": "https://ethereum-sepolia-rpc.publicnode.com",
    ]

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 15
        return URLSession(configuration: cfg)
    }()

    func balance(coin: String, network: String, address: String) async throws -> Balance {
        switch coin {
        case "btc": return try await btcBalance(network: network, address: address)
        case "eth": return try await ethBalance(network: network, address: address)
        default: throw BalanceError.unsupportedNetwork
        }
    }

    // MARK: - BTC (mempool.space)

    private func btcBalance(network: String, address: String) async throws -> Balance {
        guard let base = Self.btcBase[network],
              let url = URL(string: "\(base)/address/\(address)") else {
            throw BalanceError.unsupportedNetwork
        }
        let (data, response) = try await session.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw BalanceError.badResponse }

        struct Stats: Decodable { let funded_txo_sum: Int64; let spent_txo_sum: Int64 }
        struct Body: Decodable { let chain_stats: Stats; let mempool_stats: Stats }
        let body = try JSONDecoder().decode(Body.self, from: data)

        let confirmed = body.chain_stats.funded_txo_sum - body.chain_stats.spent_txo_sum
        let unconfirmed = body.mempool_stats.funded_txo_sum - body.mempool_stats.spent_txo_sum
        return Balance(confirmed: String(confirmed), unconfirmed: String(unconfirmed))
    }

    // MARK: - ETH (publicnode JSON-RPC)

    private func ethBalance(network: String, address: String) async throws -> Balance {
        guard let base = Self.ethBase[network], let url = URL(string: base) else {
            throw BalanceError.unsupportedNetwork
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload = #"{"jsonrpc":"2.0","method":"eth_getBalance","params":["\#(address.lowercased())","latest"],"id":1}"#
        req.httpBody = Data(payload.utf8)

        let (data, response) = try await session.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw BalanceError.badResponse }

        struct RPC: Decodable { let result: String?; let error: RPCError? }
        struct RPCError: Decodable { let message: String }
        let rpc = try JSONDecoder().decode(RPC.self, from: data)
        if let e = rpc.error { throw BalanceError.rpcError(e.message) }
        guard let hex = rpc.result else { throw BalanceError.badResponse }

        return Balance(confirmed: WalletAmount.decimalString(fromHex: hex), unconfirmed: "0")
    }
}

/// Big-number-safe amount helpers. ETH balances (wei) overflow Int64, so hex →
/// decimal and unit formatting are done with arbitrary-precision digit arrays
/// rather than native integers.
enum WalletAmount {

    /// Convert a 0x-prefixed hex string to a base-10 decimal string.
    static func decimalString(fromHex hex: String) -> String {
        let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        var digits: [UInt8] = [0] // little-endian base-10 digits
        for ch in clean {
            guard let nibble = ch.hexDigitValue else { continue }
            var carry = nibble
            for i in 0..<digits.count {
                let v = Int(digits[i]) * 16 + carry
                digits[i] = UInt8(v % 10)
                carry = v / 10
            }
            while carry > 0 {
                digits.append(UInt8(carry % 10))
                carry /= 10
            }
        }
        return String(digits.reversed().map { Character(String($0)) })
    }

    /// Format a smallest-unit decimal string (sats / wei) as a human amount with
    /// the coin's decimals, trimming trailing zeros. Mirrors the web wallet's
    /// BigInt `formatUnits`.
    static func formatUnits(_ smallest: String, decimals: Int, maxFractionDigits: Int = 8) -> String {
        let negative = smallest.hasPrefix("-")
        var value = negative ? String(smallest.dropFirst()) : smallest
        if value.isEmpty || value == "0" { return "0" }

        if decimals == 0 { return (negative ? "-" : "") + value }

        // Left-pad so there are at least `decimals + 1` digits.
        if value.count <= decimals {
            value = String(repeating: "0", count: decimals - value.count + 1) + value
        }
        let splitIndex = value.index(value.endIndex, offsetBy: -decimals)
        let intPart = String(value[value.startIndex..<splitIndex])
        var fracPart = String(value[splitIndex...])

        // Trim to maxFractionDigits, then drop trailing zeros.
        if fracPart.count > maxFractionDigits {
            fracPart = String(fracPart.prefix(maxFractionDigits))
        }
        while fracPart.hasSuffix("0") { fracPart.removeLast() }

        let sign = negative ? "-" : ""
        return fracPart.isEmpty ? "\(sign)\(intPart)" : "\(sign)\(intPart).\(fracPart)"
    }
}
