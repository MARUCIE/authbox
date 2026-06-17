import Foundation
import Testing
import BigInt
@testable import AuthBoxCrypto

/// EIP-1559 signing, anchored to micro-eth-signer golden vectors generated from
/// the SAME canonical all-zeros mnemonic the TypeScript side uses. Two classes of
/// anchor:
///
///   1. The unsigned signing hash `keccak256(0x02 ‖ rlp(9 fields))` — key-
///      independent and byte-identical across platforms. Pinning it proves the
///      RLP envelope is correct without involving any private key. A wrong byte
///      here changes the hash and thus the recovered sender: a silent loss of
///      funds.
///   2. The recovered sender — for the canonical seed this is the public EIP-55
///      anchor `0x9858…` on mainnet (m/44'/60'/0'/0/0) and `0xb157…` on testnet
///      (m/44'/1'/0'/0/0, SLIP-44 collapses every testnet coin_type to 1').
///
/// micro-eth-signer hedges its signature nonce, so the FULL signed bytes differ
/// run-to-run; the invariant asserted is sender-recovery + the deterministic
/// signing hash, never byte-equality of r/s.
@Suite("WalletTx — EIP-1559 signing")
struct WalletTxTests {

    // Canonical BIP-39 all-zeros-entropy mnemonic (same as the derivation tests).
    private static let seed = Seed.mnemonicToSeed(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")

    private static let testnetParams = WalletTx.BuildEthTxParams(
        to: "0x000000000000000000000000000000000000dEaD",
        amountWei: BigUInt("1000000000000000"),       // 0.001 ETH
        nonce: 3, gasLimit: 21000,
        maxFeePerGas: BigUInt("30000000000"),          // 30 gwei
        maxPriorityFeePerGas: BigUInt("1500000000"),   // 1.5 gwei
        chainId: 11155111, network: .testnet)

    private static let mainnetParams = WalletTx.BuildEthTxParams(
        to: "0x1111111111111111111111111111111111111111",
        amountWei: BigUInt("5000000000000000"),        // 0.005 ETH
        nonce: 0, gasLimit: 21000,
        maxFeePerGas: BigUInt("40000000000"),          // 40 gwei
        maxPriorityFeePerGas: BigUInt("2000000000"),   // 2 gwei
        chainId: 1, network: .mainnet)

    // ── Anchor 1: unsigned signing hash (key-independent RLP proof) ──────────

    @Test("unsigned signing hash matches the micro-eth-signer golden (testnet)")
    func sigHashTestnet() throws {
        let h = try WalletTx.ethSigningHash(Self.testnetParams)
        #expect("0x" + h.hexString == "0x1cca78d871566b3f5be367f35bf2e4110c5c91b8ce016d9705eac56c13d02fa6")
    }

    @Test("unsigned signing hash matches the micro-eth-signer golden (mainnet)")
    func sigHashMainnet() throws {
        let h = try WalletTx.ethSigningHash(Self.mainnetParams)
        #expect("0x" + h.hexString == "0x840312d5a2e36650b87c6447f4dfdeef6da023c689e2d8f9a4144f14ad38822b")
    }

    // ── Anchor 2: recovered sender equals the canonical derived address ──────

    @Test("signed tx recovers to the canonical mainnet sender 0x9858…Eda94")
    func mainnetSender() throws {
        let signed = try WalletTx.buildEthTransaction(seed: Self.seed, params: Self.mainnetParams)
        #expect(signed.sender == "0x9858EfFD232B4033E47d90003D41EC34EcaEda94")
        #expect(signed.hex.hasPrefix("0x02"))            // EIP-1559 typed-tx envelope
        #expect(signed.hash.hasPrefix("0x") && signed.hash.count == 66)
    }

    @Test("signed tx recovers to the testnet sender 0xb157… (coin_type 1')")
    func testnetSender() throws {
        let signed = try WalletTx.buildEthTransaction(seed: Self.seed, params: Self.testnetParams)
        #expect(signed.sender == "0xb157E208264FF9eDeBbCB1D36E66d156Df8Afa6c")
        #expect(signed.hex.hasPrefix("0x02"))
    }

    // ── Recoverable-signature primitive: sign↔recover roundtrip ──────────────

    @Test("signRecoverable then recover yields the signer's uncompressed pubkey")
    func signRecoverRoundtrip() throws {
        let priv = Wallet.derivePrivateKey(seed: Self.seed, coin: .eth,
                                           options: Wallet.DeriveOptions(network: .mainnet))
        let pub = try #require(Secp256k1.publicKey(from: priv, compressed: false))

        // Any 32-byte message hash; use keccak of a fixed label for determinism.
        let msg = Keccak256.hash(Data("auth-box sign↔recover".utf8))
        let (sig, recid) = try #require(Secp256k1.signRecoverable(messageHash: msg, privateKey: priv))
        let recovered = try #require(Secp256k1.recover(messageHash: msg, signature: sig, recoveryId: recid))

        #expect(recovered == pub)
        // And the recovered key maps to the canonical address.
        #expect(Wallet.ethAddress(fromUncompressedPublicKey: recovered)
                == "0x9858EfFD232B4033E47d90003D41EC34EcaEda94")
    }

    // ── Hedged-signature invariant: two signings, same sender ────────────────

    @Test("re-signing the same tx keeps the sender stable (sender, not bytes)")
    func senderStableAcrossSignings() throws {
        let a = try WalletTx.buildEthTransaction(seed: Self.seed, params: Self.mainnetParams)
        let b = try WalletTx.buildEthTransaction(seed: Self.seed, params: Self.mainnetParams)
        #expect(a.sender == b.sender)
        #expect(a.sender == "0x9858EfFD232B4033E47d90003D41EC34EcaEda94")
    }

    // ── Defensive: a malformed recipient must throw, never truncate ──────────

    @Test("a non-20-byte recipient is rejected")
    func rejectsBadRecipient() {
        var bad = Self.mainnetParams
        bad.to = "0x1234"   // 2 bytes, not 20
        #expect(throws: WalletTx.WalletTxError.self) {
            _ = try WalletTx.buildEthTransaction(seed: Self.seed, params: bad)
        }
    }
}
