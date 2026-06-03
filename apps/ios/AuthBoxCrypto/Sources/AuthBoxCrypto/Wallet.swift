import Foundation
import CryptoKit

/// Multi-coin HD wallet derivation for Auth Box (iOS).
///
/// Exact native mirror of `@authbox/crypto` `wallet.ts`. Same BIP-39 seed, same
/// standard BIP-32/44/84 derivation, so the user's 24 words recover the SAME
/// addresses here, in the web app, and in MetaMask / Electrum / Ledger. The
/// cross-platform parity tests assert iOS reproduces the published vectors.
///
/// Design contract (identical to web):
///   - INTEROPERABLE: standard derivation; no lock-in.
///   - SELF-CUSTODIAL + WATCH-ONLY SERVER: only the account xpub and derived
///     addresses leave the device; private keys are derived locally and never
///     transmitted or persisted.
///   - INDEPENDENT TREES: Auth Box's internal keys hang off a CUSTOM "authbox
///     seed" branch (see `Seed.deriveKey`); wallet keys hang off the STANDARD
///     BIP-32 "Bitcoin seed" tree (here). Same seed, two independent trees.
///
/// EC math is delegated to libsecp256k1 (see `Secp256k1`); hashes to CryptoKit
/// (SHA-2) plus the vendored Keccak256 / RIPEMD160. No hand-rolled curve math.
public enum Wallet {

    // MARK: - Public types (mirror wallet.ts)

    public enum Coin: String, Sendable { case btc, eth }

    /// p2wpkh = native segwit (bech32, modern default); p2pkh = legacy base58.
    public enum BtcScriptType: String, Sendable { case p2wpkh, p2pkh }

    public enum WalletNetwork: String, Sendable { case mainnet, testnet }

    public struct DeriveOptions: Sendable {
        public var account: Int
        public var change: Int          // 0 = external/receive, 1 = internal/change
        public var index: Int
        public var scriptType: BtcScriptType  // BTC only
        public var network: WalletNetwork
        public init(account: Int = 0, change: Int = 0, index: Int = 0,
                    scriptType: BtcScriptType = .p2wpkh, network: WalletNetwork = .mainnet) {
            self.account = account; self.change = change; self.index = index
            self.scriptType = scriptType; self.network = network
        }
    }

    public struct WalletAddress: Sendable {
        public let coin: Coin
        public let network: WalletNetwork
        public let address: String
        public let path: String
        public let publicKey: String       // compressed, hex
        public let account: Int
        public let change: Int
        public let index: Int
        public let scriptType: BtcScriptType?   // BTC only
    }

    public struct WalletAccount: Sendable {
        public let coin: Coin
        public let network: WalletNetwork
        public let account: Int
        public let path: String
        public let xpub: String            // standard xpub-versioned extended public key
        public let scriptType: BtcScriptType?
    }

    // MARK: - Path construction (mirror wallet.ts)

    private static func coinType(_ coin: Coin, _ network: WalletNetwork) -> UInt32 {
        if network == .testnet { return 1 }
        return coin == .btc ? 0 : 60
    }

    private static func purpose(_ coin: Coin, _ scriptType: BtcScriptType) -> UInt32 {
        if coin == .eth { return 44 }
        return scriptType == .p2wpkh ? 84 : 44
    }

    private static func accountPath(_ coin: Coin, _ account: Int, _ scriptType: BtcScriptType, _ network: WalletNetwork) -> String {
        "m/\(purpose(coin, scriptType))'/\(coinType(coin, network))'/\(account)'"
    }

    private static func addressPath(_ coin: Coin, _ account: Int, _ change: Int, _ index: Int, _ scriptType: BtcScriptType, _ network: WalletNetwork) -> String {
        "\(accountPath(coin, account, scriptType, network))/\(change)/\(index)"
    }

    // MARK: - Public API (mirror wallet.ts)

    /// Watch-only account descriptor (xpub + account path). The xpub is safe to
    /// persist server-side: it enumerates addresses but cannot sign.
    public static func deriveAccount(seed: Data, coin: Coin, options: DeriveOptions = DeriveOptions()) -> WalletAccount {
        let scriptType: BtcScriptType = coin == .btc ? options.scriptType : .p2wpkh
        let path = accountPath(coin, options.account, scriptType, options.network)
        let node = HDNode.master(seed: seed).derive(path: path)
        return WalletAccount(
            coin: coin,
            network: options.network,
            account: options.account,
            path: path,
            xpub: node.extendedPublicKey,
            scriptType: coin == .btc ? scriptType : nil
        )
    }

    /// A single receive/change address. Public key only — no private material is
    /// returned or retained.
    public static func deriveAddress(seed: Data, coin: Coin, options: DeriveOptions = DeriveOptions()) -> WalletAddress {
        let scriptType: BtcScriptType = coin == .btc ? options.scriptType : .p2wpkh
        let path = addressPath(coin, options.account, options.change, options.index, scriptType, options.network)
        let node = HDNode.master(seed: seed).derive(path: path)
        let pub = node.compressedPublicKey

        let address: String
        switch coin {
        case .btc:
            address = btcAddress(pub, scriptType: scriptType, network: options.network)
        case .eth:
            address = ethAddress(fromPrivateKey: node.privateKey)
        }

        return WalletAddress(
            coin: coin,
            network: options.network,
            address: address,
            path: path,
            publicKey: pub.hexString,
            account: options.account,
            change: options.change,
            index: options.index,
            scriptType: coin == .btc ? scriptType : nil
        )
    }

    /// Raw private key for a wallet address. CLIENT-SIDE SIGNING ONLY — never
    /// serialize, log, transmit, or persist the return value.
    public static func derivePrivateKey(seed: Data, coin: Coin, options: DeriveOptions = DeriveOptions()) -> Data {
        let scriptType: BtcScriptType = coin == .btc ? options.scriptType : .p2wpkh
        let path = addressPath(coin, options.account, options.change, options.index, scriptType, options.network)
        return HDNode.master(seed: seed).derive(path: path).privateKey
    }

    // MARK: - Address encoding

    private static func hash160(_ data: Data) -> Data {
        RIPEMD160.hash(Data(SHA256.hash(data: data)))
    }

    private static func btcAddress(_ compressedPub: Data, scriptType: BtcScriptType, network: WalletNetwork) -> String {
        let h160 = hash160(compressedPub)
        switch scriptType {
        case .p2wpkh:
            let hrp = network == .testnet ? "tb" : "bc"
            return Bech32.encodeSegwit(hrp: hrp, version: 0, program: h160)
        case .p2pkh:
            let version: UInt8 = network == .testnet ? 0x6f : 0x00
            return Base58Check.encode(version: version, payload: h160)
        }
    }

    /// Ethereum address from a private key, with EIP-55 mixed-case checksum.
    /// address = last 20 bytes of keccak256(uncompressed_pubkey[1:]); each hex
    /// nibble is upper-cased when the corresponding nibble of
    /// keccak256(lowercase-hex) is >= 8.
    static func ethAddress(fromPrivateKey privateKey: Data) -> String {
        guard let uncompressed = Secp256k1.publicKey(from: privateKey, compressed: false) else {
            fatalError("invalid private key for ETH address")
        }
        let body = Data(uncompressed.dropFirst()) // drop 0x04 prefix → 64 bytes
        let addrBytes: [UInt8] = Array(Keccak256.hash(body).suffix(20))

        let hexDigits: [Character] = Array("0123456789abcdef")
        var hexChars: [Character] = []
        hexChars.reserveCapacity(40)
        for b in addrBytes {
            hexChars.append(hexDigits[Int(b >> 4)])
            hexChars.append(hexDigits[Int(b & 0x0f)])
        }

        let checksum: [UInt8] = Array(Keccak256.hash(Data(String(hexChars).utf8)))

        var out: String = "0x"
        for i in 0..<40 {
            let byte: UInt8 = checksum[i / 2]
            let nibble: UInt8 = (i % 2 == 0) ? (byte >> 4) : (byte & 0x0f)
            let c: Character = hexChars[i]
            if nibble >= 8 && c >= "a" && c <= "f" {
                out.append(Character(c.uppercased()))
            } else {
                out.append(c)
            }
        }
        return out
    }
}

// MARK: - BIP-32 HD node

private struct HDNode {
    let privateKey: Data        // 32 bytes
    let chainCode: Data         // 32 bytes
    let depth: UInt8
    let parentFingerprint: UInt32
    let childNumber: UInt32

    var compressedPublicKey: Data {
        guard let pub = Secp256k1.publicKey(from: privateKey, compressed: true) else {
            fatalError("invalid private key in HD node")
        }
        return pub
    }

    /// First 4 bytes of hash160(compressedPublicKey), big-endian.
    var fingerprint: UInt32 {
        let h = RIPEMD160.hash(Data(SHA256.hash(data: compressedPublicKey)))
        return (UInt32(h[0]) << 24) | (UInt32(h[1]) << 16) | (UInt32(h[2]) << 8) | UInt32(h[3])
    }

    /// Master node from a BIP-39 seed, keyed by HMAC "Bitcoin seed" (standard
    /// BIP-32 — distinct from Auth Box's "authbox seed" internal tree).
    static func master(seed: Data) -> HDNode {
        let key = SymmetricKey(data: Data("Bitcoin seed".utf8))
        let I = Data(HMAC<SHA512>.authenticationCode(for: seed, using: key))
        return HDNode(privateKey: I.prefix(32), chainCode: Data(I.suffix(from: 32)),
                      depth: 0, parentFingerprint: 0, childNumber: 0)
    }

    /// Derive along a path string like "m/84'/0'/0'/0/0".
    func derive(path: String) -> HDNode {
        var node = self
        for segment in path.split(separator: "/") {
            if segment == "m" { continue }
            let hardened = segment.hasSuffix("'") || segment.hasSuffix("h")
            let numberPart = hardened ? String(segment.dropLast()) : String(segment)
            guard let index = UInt32(numberPart) else {
                fatalError("invalid path segment: \(segment)")
            }
            node = node.deriveChild(index: index, hardened: hardened)
        }
        return node
    }

    /// BIP-32 CKDpriv. Hardened: data = 0x00 || kpar || index. Non-hardened:
    /// data = serP(point(kpar)) || index. childKey = (parse256(IL) + kpar) mod n.
    private func deriveChild(index: UInt32, hardened: Bool) -> HDNode {
        let childNumber = hardened ? (index | 0x80000000) : index

        var data = Data()
        if hardened {
            data.append(0x00)
            data.append(privateKey)
        } else {
            data.append(compressedPublicKey)
        }
        data.append(UInt8((childNumber >> 24) & 0xFF))
        data.append(UInt8((childNumber >> 16) & 0xFF))
        data.append(UInt8((childNumber >> 8) & 0xFF))
        data.append(UInt8(childNumber & 0xFF))

        let key = SymmetricKey(data: chainCode)
        let I = Data(HMAC<SHA512>.authenticationCode(for: data, using: key))
        let IL = I.prefix(32)
        let IR = Data(I.suffix(from: 32))

        guard let childKey = Secp256k1.privateKeyTweakAdd(privateKey, tweak: IL) else {
            // BIP-32: invalid key (prob. < 2^-127) → skip to next index.
            return deriveChild(index: index + 1, hardened: hardened)
        }

        return HDNode(privateKey: childKey, chainCode: IR,
                      depth: depth + 1, parentFingerprint: fingerprint, childNumber: childNumber)
    }

    /// Standard xpub-versioned extended public key (version 0x0488B21E), exactly
    /// as @scure/bip32 `publicExtendedKey` serializes it (xpub even for BIP-84).
    var extendedPublicKey: String {
        var payload = Data()
        payload.append(contentsOf: [0x04, 0x88, 0xB2, 0x1E]) // mainnet public xpub
        payload.append(depth)
        payload.append(UInt8((parentFingerprint >> 24) & 0xFF))
        payload.append(UInt8((parentFingerprint >> 16) & 0xFF))
        payload.append(UInt8((parentFingerprint >> 8) & 0xFF))
        payload.append(UInt8(parentFingerprint & 0xFF))
        payload.append(UInt8((childNumber >> 24) & 0xFF))
        payload.append(UInt8((childNumber >> 16) & 0xFF))
        payload.append(UInt8((childNumber >> 8) & 0xFF))
        payload.append(UInt8(childNumber & 0xFF))
        payload.append(chainCode)
        payload.append(compressedPublicKey)
        return Base58Check.encodeRaw(payload)
    }
}

// MARK: - Hex helper

extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
