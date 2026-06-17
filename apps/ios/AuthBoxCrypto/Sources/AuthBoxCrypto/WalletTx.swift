import Foundation
import BigInt

/// Client-side transaction building + signing — the SPEND half of the wallet,
/// mirroring `packages/crypto/src/wallet-tx.ts`. `Wallet` derives watch-only
/// material (xpub + addresses) that is safe to share; this type derives the
/// PRIVATE key for the exact moment of signing and zeroes it immediately after.
/// Nothing here touches the network: it returns a fully-signed raw transaction
/// as hex, and broadcasting is a separate server-side relay of bytes the server
/// cannot have produced — so the self-custody / watch-only contract is intact.
///
/// Security contract (same as the TS side):
///   - The private key is derived locally, used once, and `resetBytes`-wiped in
///     a `defer` block so an exception mid-sign still erases it.
///   - The sender is RECOVERED from the signed payload and asserted equal to the
///     independently-derived address. A mismatch means a derivation/signing bug,
///     and we throw rather than hand back a tx that spends from an unexpected key.
///   - RLP + secp256k1 are the only hand-rolled pieces; both are pinned to
///     micro-eth-signer golden vectors in the tests (the unsigned signing hash is
///     key-independent and byte-identical across platforms).
public enum WalletTx {

    // MARK: - Ethereum (EIP-1559 / type-2)

    public struct BuildEthTxParams: Sendable {
        /// Recipient address (EIP-55 or lowercase, 0x-prefixed, 20 bytes).
        public var to: String
        /// Value to send, in wei.
        public var amountWei: BigUInt
        /// Account nonce (number of prior txs from this address).
        public var nonce: BigUInt
        public var gasLimit: BigUInt          // 21000 for a plain transfer
        public var maxFeePerGas: BigUInt      // wei
        public var maxPriorityFeePerGas: BigUInt // wei
        /// EIP-155 chain id (1 = mainnet, 11155111 = Sepolia).
        public var chainId: BigUInt
        /// Calldata. Empty = plain value transfer.
        public var data: Data
        public var account: Int               // default 0
        public var change: Int                // default 0
        public var index: Int                 // default 0
        /// Selects the BIP-44 coin_type only (60' mainnet / 1' testnet).
        public var network: Wallet.WalletNetwork

        public init(to: String, amountWei: BigUInt, nonce: BigUInt, gasLimit: BigUInt,
                    maxFeePerGas: BigUInt, maxPriorityFeePerGas: BigUInt, chainId: BigUInt,
                    data: Data = Data(), account: Int = 0, change: Int = 0, index: Int = 0,
                    network: Wallet.WalletNetwork = .mainnet) {
            self.to = to; self.amountWei = amountWei; self.nonce = nonce
            self.gasLimit = gasLimit; self.maxFeePerGas = maxFeePerGas
            self.maxPriorityFeePerGas = maxPriorityFeePerGas; self.chainId = chainId
            self.data = data; self.account = account; self.change = change
            self.index = index; self.network = network
        }
    }

    public struct SignedEthTransaction: Sendable {
        public let coin: Wallet.Coin   // always .eth
        /// Fully-signed EIP-1559 typed transaction, hex (0x02…), ready to relay.
        public let hex: String
        /// Transaction hash, 0x-prefixed.
        public let hash: String
        /// Sender recovered from the signature; equals the derived address.
        public let sender: String
    }

    public enum WalletTxError: Error, Sendable, Equatable {
        case invalidRecipient(String)
        case signingFailed
        case senderMismatch(expected: String, recovered: String)
    }

    /// The 9 unsigned EIP-1559 fields in canonical order. Integers go through
    /// `RLP.bytes` (minimal big-endian); `to` is a fixed-width 20-byte string
    /// (leading zeros preserved); the access list is an empty list.
    private static func ethUnsignedFields(_ p: BuildEthTxParams, toBytes: Data) -> [RLP.Item] {
        [
            RLP.bytes(p.chainId),
            RLP.bytes(p.nonce),
            RLP.bytes(p.maxPriorityFeePerGas),
            RLP.bytes(p.maxFeePerGas),
            RLP.bytes(p.gasLimit),
            .bytes(toBytes),
            RLP.bytes(p.amountWei),
            .bytes(p.data),
            .list([]),              // empty accessList
        ]
    }

    /// keccak256(0x02 ‖ rlp(9 unsigned fields)) — the message that gets signed.
    /// Key-independent and deterministic, so the tests pin it to a
    /// micro-eth-signer golden vector to prove RLP byte-correctness in isolation
    /// from any private key.
    static func ethSigningHash(_ p: BuildEthTxParams) throws -> Data {
        guard let to = Data(ethHex: p.to), to.count == 20 else {
            throw WalletTxError.invalidRecipient(p.to)
        }
        let rlp = RLP.encode(.list(ethUnsignedFields(p, toBytes: to)))
        return Keccak256.hash(Data([0x02]) + rlp)
    }

    /// Build and sign an EIP-1559 transaction entirely on the client.
    ///
    /// Mirrors `buildEthTransaction` in wallet-tx.ts: derive → sign → recover →
    /// assert sender == derived address → assemble the signed envelope. The TS
    /// side hedges its signature nonce, so the two implementations differ
    /// byte-wise on r/s, but both recover to the same sender — the only invariant
    /// that matters for a funds-moving tx.
    public static func buildEthTransaction(seed: Data, params p: BuildEthTxParams) throws -> SignedEthTransaction {
        guard let toBytes = Data(ethHex: p.to), toBytes.count == 20 else {
            throw WalletTxError.invalidRecipient(p.to)
        }

        let opts = Wallet.DeriveOptions(account: p.account, change: p.change,
                                        index: p.index, network: p.network)
        let expected = Wallet.deriveAddress(seed: seed, coin: .eth, options: opts).address

        var priv = Wallet.derivePrivateKey(seed: seed, coin: .eth, options: opts)
        defer { priv.resetBytes(in: 0..<priv.count) }   // wipe the key, even on throw

        let unsignedFields = ethUnsignedFields(p, toBytes: toBytes)
        let sigHash = Keccak256.hash(Data([0x02]) + RLP.encode(.list(unsignedFields)))

        guard let (sig, recid) = Secp256k1.signRecoverable(messageHash: sigHash, privateKey: priv) else {
            throw WalletTxError.signingFailed
        }

        // r and s are 32-byte big-endian integers; RLP wants them minimal
        // (leading zeros stripped), exactly like RLP.bytes does for a BigUInt.
        let signedFields = unsignedFields + [
            RLP.bytes(BigUInt(recid)),                       // yParity (0/1); 0 → 0x80
            .bytes(minimalBigEndian(Data(sig.prefix(32)))),  // r
            .bytes(minimalBigEndian(Data(sig.suffix(32)))),  // s
        ]
        let signedTx = Data([0x02]) + RLP.encode(.list(signedFields))
        let txHash = Keccak256.hash(signedTx)

        guard let pub = Secp256k1.recover(messageHash: sigHash, signature: sig, recoveryId: recid) else {
            throw WalletTxError.signingFailed
        }
        let sender = Wallet.ethAddress(fromUncompressedPublicKey: pub)
        guard sender.lowercased() == expected.lowercased() else {
            throw WalletTxError.senderMismatch(expected: expected, recovered: sender)
        }

        return SignedEthTransaction(coin: .eth,
                                    hex: "0x" + signedTx.hexString,
                                    hash: "0x" + txHash.hexString,
                                    sender: sender)
    }

    // MARK: - Private helpers

    private static func minimalBigEndian(_ data: Data) -> Data {
        Data(data.drop { $0 == 0 })
    }
}

private extension Data {
    /// Parse a 0x-optional hex string into raw bytes. Returns nil on odd length
    /// or any non-hex character — a malformed recipient address must fail loudly,
    /// never silently truncate into a wrong-address spend.
    init?(ethHex string: String) {
        var s = Substring(string)
        if s.hasPrefix("0x") || s.hasPrefix("0X") { s = s.dropFirst(2) }
        guard s.count % 2 == 0 else { return nil }
        var out = Data(capacity: s.count / 2)
        var idx = s.startIndex
        while idx < s.endIndex {
            let next = s.index(idx, offsetBy: 2)
            guard let byte = UInt8(s[idx..<next], radix: 16) else { return nil }
            out.append(byte)
            idx = next
        }
        self = out
    }
}
