import Foundation
import libsecp256k1

/// Minimal secp256k1 operations needed for BIP-32 HD derivation (and, later,
/// ECDSA signing). All elliptic-curve math is delegated to libsecp256k1 — the
/// audited Bitcoin Core C library — exactly as the TypeScript side delegates to
/// @noble/curves. This file only marshals bytes; it implements no curve math.
///
/// The static context (`secp256k1_context_static`) is sufficient for every
/// operation here in modern libsecp256k1, so there is no context lifecycle to
/// manage.
enum Secp256k1 {

    // A created context (built once for the process lifetime). The static
    // context lacks the ecmult_gen table needed by pubkey_create, so a real
    // context is required. The flag is a legacy no-op in modern libsecp256k1:
    // every created context builds both ecmult and ecmult_gen. The context is
    // immutable after creation and safe for concurrent reads, so the Swift-6
    // shared-mutable-state check is deliberately suppressed.
    nonisolated(unsafe) private static let ctx: OpaquePointer =
        secp256k1_context_create(UInt32(SECP256K1_CONTEXT_NONE))!

    /// Public key for a 32-byte private key.
    /// - Parameter compressed: true → 33-byte compressed (BTC / BIP-32 internal),
    ///   false → 65-byte uncompressed (needed for the ETH address hash).
    /// - Returns: serialized public key, or nil if the scalar is invalid.
    static func publicKey(from privateKey: Data, compressed: Bool = true) -> Data? {
        precondition(privateKey.count == 32, "private key must be 32 bytes")
        var pubkey = secp256k1_pubkey()
        let created = privateKey.withUnsafeBytes { sk in
            secp256k1_ec_pubkey_create(ctx, &pubkey, sk.bindMemory(to: UInt8.self).baseAddress!)
        }
        guard created == 1 else { return nil }
        return serialize(&pubkey, compressed: compressed)
    }

    /// BIP-32 private CKD step: childKey = (tweak + parentKey) mod n.
    /// Returns nil when the result is the point at infinity / out of range, in
    /// which case BIP-32 requires skipping to the next index.
    static func privateKeyTweakAdd(_ privateKey: Data, tweak: Data) -> Data? {
        precondition(privateKey.count == 32 && tweak.count == 32)
        var sk = [UInt8](privateKey)
        let ok = tweak.withUnsafeBytes { tw in
            secp256k1_ec_seckey_tweak_add(ctx, &sk, tw.bindMemory(to: UInt8.self).baseAddress!)
        }
        guard ok == 1 else { sk.resetBytes(in: 0..<sk.count); return nil }
        let out = Data(sk)
        sk.resetBytes(in: 0..<sk.count)
        return out
    }

    /// BIP-32 public CKD step: childPub = parentPub + tweak·G. Both keys
    /// compressed. Used for xpub-only (watch-only) address enumeration.
    static func publicKeyTweakAdd(_ compressedPublicKey: Data, tweak: Data) -> Data? {
        precondition(tweak.count == 32)
        var pubkey = secp256k1_pubkey()
        let parsed = compressedPublicKey.withUnsafeBytes { pk in
            secp256k1_ec_pubkey_parse(ctx, &pubkey, pk.bindMemory(to: UInt8.self).baseAddress!, compressedPublicKey.count)
        }
        guard parsed == 1 else { return nil }
        let ok = tweak.withUnsafeBytes { tw in
            secp256k1_ec_pubkey_tweak_add(ctx, &pubkey, tw.bindMemory(to: UInt8.self).baseAddress!)
        }
        guard ok == 1 else { return nil }
        return serialize(&pubkey, compressed: true)
    }

    // MARK: - Private

    private static func serialize(_ pubkey: inout secp256k1_pubkey, compressed: Bool) -> Data {
        let length = compressed ? 33 : 65
        var out = [UInt8](repeating: 0, count: length)
        var outLen = length
        let flags = UInt32(compressed ? SECP256K1_EC_COMPRESSED : SECP256K1_EC_UNCOMPRESSED)
        _ = secp256k1_ec_pubkey_serialize(ctx, &out, &outLen, &pubkey, flags)
        return Data(out.prefix(outLen))
    }
}

private extension Array where Element == UInt8 {
    mutating func resetBytes(in range: Range<Int>) {
        for i in range { self[i] = 0 }
    }
}
