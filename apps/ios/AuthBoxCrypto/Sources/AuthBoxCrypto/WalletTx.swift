import Foundation
import BigInt
import CryptoKit

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

    // MARK: - Bitcoin (P2WPKH / native segwit, BIP-143)

    public struct BtcSpendableUtxo: Sendable {
        public var txid: String       // big-endian DISPLAY order (as explorers show it)
        public var vout: UInt32
        public var value: UInt64      // satoshis
        public var account: Int       // BIP-44 account (default 0)
        public var change: Int        // 0 = external/receive (default), 1 = internal/change
        public var index: Int         // address index (default 0)
        public init(txid: String, vout: UInt32, value: UInt64,
                    account: Int = 0, change: Int = 0, index: Int = 0) {
            self.txid = txid; self.vout = vout; self.value = value
            self.account = account; self.change = change; self.index = index
        }
    }

    public struct BuildBtcTxParams: Sendable {
        public var utxos: [BtcSpendableUtxo]
        public var to: String                 // recipient segwit-v0 address
        public var amountSats: UInt64
        public var changeAddress: String      // usually a fresh internal address
        public var feeRateSatPerVb: Int       // >= 1
        public var network: Wallet.WalletNetwork
        public init(utxos: [BtcSpendableUtxo], to: String, amountSats: UInt64,
                    changeAddress: String, feeRateSatPerVb: Int,
                    network: Wallet.WalletNetwork = .mainnet) {
            self.utxos = utxos; self.to = to; self.amountSats = amountSats
            self.changeAddress = changeAddress; self.feeRateSatPerVb = feeRateSatPerVb
            self.network = network
        }
    }

    public struct SignedBtcTransaction: Sendable {
        public let coin: Wallet.Coin   // always .btc
        public let hex: String         // fully-signed raw tx, ready to relay
        public let txid: String        // big-endian display order
        public let fee: UInt64         // satoshis actually paid
        public let vsize: Int          // virtual size, vbytes
    }

    public enum BtcTxError: Error, Sendable, Equatable {
        case noUtxos
        case badAmount
        case badFeeRate
        case insufficientFunds
        case badAddress(String)
    }

    /// P2WPKH dust threshold (satoshis): an output below this costs more to spend
    /// than it is worth, so a change output under it is dropped into the fee.
    private static let p2wpkhDust: UInt64 = 294

    /// Build and sign a native-segwit (P2WPKH) Bitcoin transaction on the client,
    /// mirroring `buildBtcTransaction` in wallet-tx.ts. Coin selection is
    /// accumulative (largest-first); the funds-critical serialization + BIP-143
    /// sighash + witness assembly are pinned to @scure/btc-signer golden vectors
    /// in the tests (txid is witness-independent and therefore deterministic).
    public static func buildBtcTransaction(seed: Data, params p: BuildBtcTxParams) throws -> SignedBtcTransaction {
        guard !p.utxos.isEmpty else { throw BtcTxError.noUtxos }
        guard p.amountSats > 0 else { throw BtcTxError.badAmount }
        guard p.feeRateSatPerVb >= 1 else { throw BtcTxError.badFeeRate }

        let recipientScript = try scriptPubKey(forAddress: p.to)
        let changeScript = try scriptPubKey(forAddress: p.changeAddress)
        let feeRate = UInt64(p.feeRateSatPerVb)

        // Resolve each candidate to its PUBLIC signing material only. The private
        // key is derived just-in-time inside the signing loop and wiped right
        // after, so nothing secret survives in the selection arrays (Swift's
        // copy-on-write Data makes in-place wiping of struct-array elements
        // unreliable — deriving on demand sidesteps that entirely).
        var resolved = try p.utxos.map { u -> BtcCandidate in
            let opts = Wallet.DeriveOptions(account: u.account, change: u.change,
                                            index: u.index, scriptType: .p2wpkh, network: p.network)
            var priv = Wallet.derivePrivateKey(seed: seed, coin: .btc, options: opts)
            defer { priv.resetBytes(in: 0..<priv.count) }
            guard let pub = Secp256k1.publicKey(from: priv, compressed: true) else {
                throw BtcTxError.badAddress(u.txid)
            }
            return BtcCandidate(utxo: u, pubkey: pub)
        }

        // Accumulative selection, largest-first. Estimate fee assuming a change
        // output present; if the resulting change is dust, drop it into the fee.
        resolved.sort { $0.utxo.value > $1.utxo.value }
        var selected: [BtcCandidate] = []
        var inTotal: UInt64 = 0
        var chosenFee: UInt64 = 0
        var changeValue: UInt64 = 0
        var haveChange = false

        for input in resolved {
            selected.append(input)
            inTotal += input.utxo.value
            let feeWithChange = feeRate * UInt64(estimateVsize(inputs: selected.count,
                                                              outputScripts: [recipientScript, changeScript]))
            let feeNoChange = feeRate * UInt64(estimateVsize(inputs: selected.count,
                                                            outputScripts: [recipientScript]))
            // Prefer a change output when the leftover clears dust; otherwise
            // spend the remainder as fee (no change output).
            if inTotal >= p.amountSats + feeWithChange {
                let change = inTotal - p.amountSats - feeWithChange
                if change >= p2wpkhDust {
                    chosenFee = feeWithChange; changeValue = change; haveChange = true
                    break
                }
            }
            if inTotal >= p.amountSats + feeNoChange {
                chosenFee = inTotal - p.amountSats   // fold the sub-dust remainder into the fee
                changeValue = 0; haveChange = false
                break
            }
        }
        guard chosenFee > 0 || haveChange else { throw BtcTxError.insufficientFunds }
        if !haveChange && inTotal < p.amountSats { throw BtcTxError.insufficientFunds }

        // Outputs, then BIP-69 canonical ordering (value asc, then scriptPubKey).
        var outputs = [BtcOutput(value: p.amountSats, scriptPubKey: recipientScript)]
        if haveChange { outputs.append(BtcOutput(value: changeValue, scriptPubKey: changeScript)) }
        outputs.sort { a, b in
            a.value != b.value ? a.value < b.value : lexLess(a.scriptPubKey, b.scriptPubKey)
        }

        let (hex, txid, vsize) = buildSignedP2wpkh(seed: seed, network: p.network,
                                                   inputs: selected, outputs: outputs)
        return SignedBtcTransaction(coin: .btc, hex: hex, txid: txid, fee: chosenFee, vsize: vsize)
    }

    // MARK: - BTC internals

    struct BtcCandidate { let utxo: BtcSpendableUtxo; let pubkey: Data }   // internal: tests pin BIP-143
    struct BtcOutput { let value: UInt64; let scriptPubKey: Data }

    /// Per-input BIP-143 (segwit v0) signing hashes for a P2WPKH spend, given the
    /// fully-specified inputs and outputs. PURE — no private keys — so the tests
    /// pin it directly to the @scure/btc-signer golden digest. Fixed nSequence
    /// 0xffffffff, version 2, locktime 0, SIGHASH_ALL.
    static func bip143Sighashes(inputs: [BtcCandidate], outputs: [BtcOutput]) -> [Data] {
        let version = le(2, 4)
        let locktime = le(0, 4)
        let sequence = Data([0xff, 0xff, 0xff, 0xff])
        var prevoutsBlob = Data(), sequenceBlob = Data()
        for inp in inputs { prevoutsBlob.append(outpoint(inp.utxo)); sequenceBlob.append(sequence) }
        let hashPrevouts = sha256d(prevoutsBlob)
        let hashSequence = sha256d(sequenceBlob)
        let hashOutputs = sha256d(serializeOutputs(outputs))
        return inputs.map { inp in
            let keyhash = hash160(inp.pubkey)
            let scriptCode = Data([0x19, 0x76, 0xa9, 0x14]) + keyhash + Data([0x88, 0xac])
            var pre = Data()
            pre.append(version); pre.append(hashPrevouts); pre.append(hashSequence)
            pre.append(outpoint(inp.utxo)); pre.append(scriptCode); pre.append(le(inp.utxo.value, 8))
            pre.append(sequence); pre.append(hashOutputs); pre.append(locktime); pre.append(le(1, 4))
            return sha256d(pre)
        }
    }

    private static func serializeOutputs(_ outputs: [BtcOutput]) -> Data {
        var blob = Data()
        for o in outputs {
            blob.append(le(o.value, 8))
            blob.append(varint(o.scriptPubKey.count))
            blob.append(o.scriptPubKey)
        }
        return blob
    }

    /// Serialize + sign a P2WPKH tx (version 2, locktime 0, nSequence 0xffffffff)
    /// over the given inputs/outputs (caller supplies canonical output order).
    /// The private key for each input is derived just-in-time and wiped right
    /// after signing. Returns (signed hex, display txid, vsize) — the byte-exact
    /// core the golden vectors pin.
    private static func buildSignedP2wpkh(seed: Data, network: Wallet.WalletNetwork,
                                          inputs: [BtcCandidate],
                                          outputs: [BtcOutput]) -> (hex: String, txid: String, vsize: Int) {
        let version = le(2, 4)
        let locktime = le(0, 4)
        let sequence = Data([0xff, 0xff, 0xff, 0xff])
        let outputsBlob = serializeOutputs(outputs)

        // Per-input BIP-143 sighash (shared, golden-pinned) → DER sig + SIGHASH_ALL.
        let sighashes = bip143Sighashes(inputs: inputs, outputs: outputs)
        var witnesses = [Data]()
        for (i, inp) in inputs.enumerated() {
            var priv = Wallet.derivePrivateKey(seed: seed, coin: .btc,
                options: Wallet.DeriveOptions(account: inp.utxo.account, change: inp.utxo.change,
                                              index: inp.utxo.index, scriptType: .p2wpkh, network: network))
            let der = Secp256k1.signDER(messageHash: sighashes[i], privateKey: priv)!
            priv.resetBytes(in: 0..<priv.count)
            let sigWithFlag = der + Data([0x01])  // SIGHASH_ALL
            // witness stack: <num items=2> <len><sig> <len><pubkey>
            var w = Data([0x02])
            w.append(varint(sigWithFlag.count)); w.append(sigWithFlag)
            w.append(varint(inp.pubkey.count)); w.append(inp.pubkey)
            witnesses.append(w)
        }

        // Non-witness serialization (this is what the txid hashes).
        var base = Data()
        base.append(version)
        base.append(varint(inputs.count))
        for inp in inputs {
            base.append(outpoint(inp.utxo))
            base.append(varint(0))               // empty scriptSig (segwit)
            base.append(sequence)
        }
        base.append(varint(outputs.count))
        base.append(outputsBlob)
        base.append(locktime)

        // Full segwit serialization = version ‖ 0x0001 ‖ inputs ‖ outputs ‖ witnesses ‖ locktime.
        var full = Data()
        full.append(version)
        full.append(Data([0x00, 0x01]))          // segwit marker + flag
        full.append(varint(inputs.count))
        for inp in inputs {
            full.append(outpoint(inp.utxo))
            full.append(varint(0))
            full.append(sequence)
        }
        full.append(varint(outputs.count))
        full.append(outputsBlob)
        for w in witnesses { full.append(w) }
        full.append(locktime)

        let txid = Data(sha256d(base).reversed()).hexString
        let weight = base.count * 4 + (full.count - base.count)
        let vsize = (weight + 3) / 4              // ceil(weight / 4)
        return (full.hexString, txid, vsize)
    }

    /// scriptPubKey for a segwit-v0 address: OP_0 ‖ push(program). Throws on a
    /// malformed or non-v0 address rather than silently producing a bad script.
    static func scriptPubKey(forAddress address: String) throws -> Data {
        guard let (_, version, program) = Bech32.decodeSegwit(address), version == 0 else {
            throw BtcTxError.badAddress(address)
        }
        return Data([0x00, UInt8(program.count)]) + program
    }

    /// Estimated virtual size for a P2WPKH spend. Witness sig items are modeled at
    /// 72 bytes (DER 71 + SIGHASH flag, the low-R-grinded common case); the ceil
    /// in vsize absorbs the ±1 from grinding, matching @scure's fee estimate.
    private static func estimateVsize(inputs nIn: Int, outputScripts: [Data]) -> Int {
        let baseInputs = nIn * 41                                  // 32 txid + 4 vout + 1 scriptlen(0) + 4 seq
        let baseOutputs = outputScripts.reduce(0) { $0 + 8 + varint($1.count).count + $1.count }
        let base = 4 + varint(nIn).count + baseInputs + varint(outputScripts.count).count + baseOutputs + 4
        let witness = 2 + nIn * (1 + 1 + 72 + 1 + 33)
        let weight = base * 4 + witness
        return (weight + 3) / 4
    }

    private static func outpoint(_ u: BtcSpendableUtxo) -> Data {
        Data(hexToData(u.txid).reversed()) + le(UInt64(u.vout), 4)
    }

    private static func lexLess(_ a: Data, _ b: Data) -> Bool {
        for (x, y) in zip(a, b) where x != y { return x < y }
        return a.count < b.count
    }

    // MARK: - Private helpers

    private static func minimalBigEndian(_ data: Data) -> Data {
        Data(data.drop { $0 == 0 })
    }

    /// Little-endian fixed-width encoding of an unsigned integer.
    private static func le(_ value: UInt64, _ bytes: Int) -> Data {
        var v = value
        var out = Data(capacity: bytes)
        for _ in 0..<bytes { out.append(UInt8(v & 0xff)); v >>= 8 }
        return out
    }

    /// Bitcoin CompactSize (varint) encoding.
    private static func varint(_ n: Int) -> Data {
        let v = UInt64(n)
        if v < 0xfd { return Data([UInt8(v)]) }
        if v <= 0xffff { return Data([0xfd]) + le(v, 2) }
        if v <= 0xffff_ffff { return Data([0xfe]) + le(v, 4) }
        return Data([0xff]) + le(v, 8)
    }

    private static func sha256d(_ data: Data) -> Data {
        Data(SHA256.hash(data: Data(SHA256.hash(data: data))))
    }

    private static func hash160(_ data: Data) -> Data {
        RIPEMD160.hash(Data(SHA256.hash(data: data)))
    }

    private static func hexToData(_ string: String) -> Data {
        Data(ethHex: string) ?? Data()
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
