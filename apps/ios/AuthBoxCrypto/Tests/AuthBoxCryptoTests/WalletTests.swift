import Foundation
import Testing
@testable import AuthBoxCrypto

/// Wallet derivation parity tests.
///
/// Every expected value here is a PUBLIC anchor: the addresses are the canonical
/// iancoleman / BIP-84 vectors for the all-zeros-entropy mnemonic, and the xpub
/// / testnet / change values were produced by the reference TypeScript
/// `@authbox/crypto` (`deriveAccount` / `deriveAddress`) for the SAME seed.
/// If any of these fail, iOS and Web derive different addresses from one seed —
/// funds visible on one device would be invisible on the other.
@Suite("Wallet — cross-platform derivation parity")
struct WalletTests {

    static let mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    static var seed: Data { Seed.mnemonicToSeed(mnemonic) }

    // MARK: - Vendored hash primitives (public vectors)

    @Test func keccak256EmptyVector() {
        #expect(Keccak256.hash(Data()).hexString ==
            "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
    }

    @Test func keccak256AbcVector() {
        #expect(Keccak256.hash(Data("abc".utf8)).hexString ==
            "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45")
    }

    @Test func ripemd160Vectors() {
        #expect(RIPEMD160.hash(Data()).hexString == "9c1185a5c5e9fc54612808977ee8f548b2258d31")
        #expect(RIPEMD160.hash(Data("abc".utf8)).hexString == "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc")
    }

    // MARK: - secp256k1 wrapper

    @Test func secp256k1PublicKeyFromKnownPrivateKey() {
        // Hardhat/test private key 0x0000…0001 → its compressed pubkey is the
        // generator point G, a fixed public constant.
        var priv = Data(count: 32); priv[31] = 0x01
        let pub = Secp256k1.publicKey(from: priv, compressed: true)
        #expect(pub?.hexString == "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
    }

    // MARK: - BTC / ETH address anchors (== published vectors & TS reference)

    @Test func btcNativeSegwitBIP84() {
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .btc).address ==
            "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu")
    }

    @Test func btcLegacyBIP44() {
        let opts = Wallet.DeriveOptions(scriptType: .p2pkh)
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .btc, options: opts).address ==
            "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA")
    }

    @Test func ethBIP44WithEIP55Checksum() {
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .eth).address ==
            "0x9858EfFD232B4033E47d90003D41EC34EcaEda94")
    }

    @Test func btcTestnetSegwit() {
        let opts = Wallet.DeriveOptions(network: .testnet)
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .btc, options: opts).address ==
            "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl")
    }

    @Test func ethChangeChainAddress() {
        let opts = Wallet.DeriveOptions(change: 1)
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .eth, options: opts).address ==
            "0x399Db6Ed32539fbDF44c3e7678b5b428e378F666")
    }

    @Test func btcCompressedPublicKeyMatchesReference() {
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .btc).publicKey ==
            "0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c")
    }

    // MARK: - Watch-only account xpub (== TS @scure/bip32 publicExtendedKey)

    @Test func accountXpubMatchesReference() {
        let account = Wallet.deriveAccount(seed: Self.seed, coin: .btc) // m/84'/0'/0'
        #expect(account.xpub ==
            "xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V")
        #expect(account.path == "m/84'/0'/0'")
        #expect(account.scriptType == .p2wpkh)
    }

    // MARK: - Path + metadata shape

    @Test func derivationPathsMatchStandard() {
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .btc).path == "m/84'/0'/0'/0/0")
        let legacy = Wallet.DeriveOptions(scriptType: .p2pkh)
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .btc, options: legacy).path == "m/44'/0'/0'/0/0")
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .eth).path == "m/44'/60'/0'/0/0")
    }

    @Test func ethHasNoScriptTypeBtcDoes() {
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .eth).scriptType == nil)
        #expect(Wallet.deriveAddress(seed: Self.seed, coin: .btc).scriptType == .p2wpkh)
    }
}
