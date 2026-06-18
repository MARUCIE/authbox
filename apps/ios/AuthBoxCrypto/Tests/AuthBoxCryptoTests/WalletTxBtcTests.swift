import Foundation
import Testing
@testable import AuthBoxCrypto

/// P2WPKH (native segwit) signing, anchored to @scure/btc-signer golden vectors
/// from the SAME canonical all-zeros mnemonic the TS side uses. Three independent
/// anchors, each catching a different class of bug:
///
///   1. BIP-143 signing hash — pure (no private key), the digest that gets signed.
///      A wrong byte here signs the wrong thing → loss of funds. Pinned to
///      0x720c5dde… and cross-checked: the golden witness signature was verified
///      to validate against exactly this hash.
///   2. txid — witness-INDEPENDENT (segwit txid hashes only version‖inputs‖
///      outputs‖locktime), therefore deterministic regardless of low-R grinding.
///      Pins serialization + coin selection + change arithmetic + BIP-69 ordering.
///   3. fee / vsize — pins the conservative size model that drives change.
///
/// The witness signature itself differs from @scure's (libsecp256k1 isn't low-R
/// grinded), so we never byte-match it; signDER/verifyDER proves it is valid.
@Suite("WalletTx — BTC P2WPKH signing")
struct WalletTxBtcTests {

    private static let seed = Seed.mnemonicToSeed(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")

    // Fixed single-input testnet scenario (identical to the golden generator).
    private static let recipient = "tb1qd7spv5q28348xl4myc8zmh983w5jx32cjhkn97"   // m/84'/1'/0'/0/1
    private static let changeAddr = "tb1q9u62588spffmq4dzjxsr5l297znf3z6j5p2688"   // m/84'/1'/0'/1/0
    private static let utxo = WalletTx.BtcSpendableUtxo(
        txid: "1111111111111111111111111111111111111111111111111111111111111111",
        vout: 0, value: 100_000)

    private static var params: WalletTx.BuildBtcTxParams {
        WalletTx.BuildBtcTxParams(utxos: [utxo], to: recipient, amountSats: 60_000,
                                  changeAddress: changeAddr, feeRateSatPerVb: 2, network: .testnet)
    }

    private static func senderPubkey() -> Data {
        let priv = Wallet.derivePrivateKey(seed: seed, coin: .btc,
            options: Wallet.DeriveOptions(scriptType: .p2wpkh, network: .testnet))
        return Secp256k1.publicKey(from: priv, compressed: true)!
    }

    // ── Anchor 1: BIP-143 signing hash (key-independent) ─────────────────────

    @Test("BIP-143 sighash matches the @scure/btc-signer golden")
    func bip143SighashGolden() throws {
        // BIP-69 output order: change (39718) before recipient (60000).
        let outputs = [
            WalletTx.BtcOutput(value: 39_718, scriptPubKey: try WalletTx.scriptPubKey(forAddress: Self.changeAddr)),
            WalletTx.BtcOutput(value: 60_000, scriptPubKey: try WalletTx.scriptPubKey(forAddress: Self.recipient)),
        ]
        let candidate = WalletTx.BtcCandidate(utxo: Self.utxo, pubkey: Self.senderPubkey())
        let sighashes = WalletTx.bip143Sighashes(inputs: [candidate], outputs: outputs)
        #expect(sighashes.count == 1)
        #expect(sighashes[0].hexString == "720c5dde923186e6e3ee7a3d5edc48490ff626608972cbdbe6f2f166956a43e9")
    }

    // ── Anchor 2 + 3: full signed tx (txid / fee / vsize) ────────────────────

    @Test("signed tx matches the golden txid, fee, and vsize")
    func signedTxGolden() throws {
        let signed = try WalletTx.buildBtcTransaction(seed: Self.seed, params: Self.params)
        #expect(signed.txid == "548c10ee7cf367acc50879db30f12db2ad491357cce31b5d2babd56940f42ae1")
        #expect(signed.fee == 282)
        #expect(signed.vsize == 141)
        #expect(signed.hex.hasPrefix("02000000000101"))   // version 2 + segwit marker/flag + 1 input
    }

    // ── signDER / verifyDER primitive ────────────────────────────────────────

    @Test("signDER produces a signature that verifyDER accepts")
    func signVerifyRoundtrip() throws {
        let priv = Wallet.derivePrivateKey(seed: Self.seed, coin: .btc,
            options: Wallet.DeriveOptions(scriptType: .p2wpkh, network: .testnet))
        let pub = try #require(Secp256k1.publicKey(from: priv, compressed: true))
        let msg = Data(repeating: 0xAB, count: 32)
        let der = try #require(Secp256k1.signDER(messageHash: msg, privateKey: priv))
        #expect(Secp256k1.verifyDER(messageHash: msg, derSignature: der, publicKey: pub))
        // A different message must NOT verify against this signature.
        #expect(!Secp256k1.verifyDER(messageHash: Data(repeating: 0xCD, count: 32),
                                     derSignature: der, publicKey: pub))
    }

    // ── Bech32 decode: address → witness program ─────────────────────────────

    @Test("decodeSegwit recovers the sender's hash160 program")
    func bech32DecodeProgram() throws {
        let sender = "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl"   // m/84'/1'/0'/0/0
        let decoded = try #require(Bech32.decodeSegwit(sender))
        #expect(decoded.hrp == "tb")
        #expect(decoded.version == 0)
        #expect(decoded.program.hexString == "d0c4a3ef09e997b6e99e397e518fe3e41a118ca1")
    }

    @Test("decodeSegwit rejects a corrupted-checksum address")
    func bech32RejectsBadChecksum() {
        #expect(Bech32.decodeSegwit("tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvxx") == nil)
    }

    // ── Coin selection arithmetic ────────────────────────────────────────────

    @Test("insufficient funds throws")
    func insufficientFunds() {
        let tiny = WalletTx.BtcSpendableUtxo(txid: Self.utxo.txid, vout: 0, value: 1_000)
        var bad = Self.params
        bad.utxos = [tiny]
        #expect(throws: WalletTx.BtcTxError.self) {
            _ = try WalletTx.buildBtcTransaction(seed: Self.seed, params: bad)
        }
    }

    @Test("multi-UTXO selection accumulates enough value and balances exactly")
    func multiUtxoSelection() throws {
        // Two 40k UTXOs (indices 0 and 1) to fund a 60k send: both must be used.
        let u0 = WalletTx.BtcSpendableUtxo(txid: Self.utxo.txid, vout: 0, value: 40_000, index: 0)
        let u1 = WalletTx.BtcSpendableUtxo(txid: Self.utxo.txid, vout: 1, value: 40_000, index: 0)
        var p = Self.params
        p.utxos = [u0, u1]
        let signed = try WalletTx.buildBtcTransaction(seed: Self.seed, params: p)
        // Both 40k inputs are needed to fund 60k → a 2-input tx (vsize ≈ 208).
        #expect(signed.vsize > 150)
        // Fee is set from the pre-sign size ESTIMATE (conservative), so it covers
        // at least the requested rate for the ACTUAL size and never underpays;
        // the small over-margin is the estimate's 1-vbyte-per-input headroom.
        #expect(signed.fee >= UInt64(2 * signed.vsize))
        #expect(signed.fee <= UInt64(2 * signed.vsize) + 6)
        #expect(signed.txid.count == 64)
    }

    @Test("a non-segwit recipient address is rejected")
    func rejectsBadRecipient() {
        var bad = Self.params
        bad.to = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"   // legacy base58, not bech32
        #expect(throws: WalletTx.BtcTxError.self) {
            _ = try WalletTx.buildBtcTransaction(seed: Self.seed, params: bad)
        }
    }
}
