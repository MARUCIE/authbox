import Foundation
import BigInt

/// Recursive Length Prefix (RLP) encoding — Ethereum's canonical serialization
/// for transactions. Mirrors the byte output that the TypeScript side gets from
/// micro-eth-signer, so an EIP-1559 envelope built here hashes identically and
/// recovers to the same sender.
///
/// Only ENCODING is implemented (a wallet never needs to decode its own tx).
/// Two item kinds: a byte string and a list. Integers are NOT a distinct kind —
/// callers pass them as minimal big-endian byte strings via `bytes(_:BigUInt)`,
/// because that is exactly how RLP treats them (and the #1 footgun: a zero must
/// encode as the EMPTY string 0x80, never as 0x00).
enum RLP {
    indirect enum Item {
        case bytes(Data)
        case list([Item])
    }

    /// Minimal big-endian byte string for an unsigned integer, per RLP rules:
    /// no leading zero bytes, and zero is the EMPTY string (encodes to 0x80).
    static func bytes(_ value: BigUInt) -> Item {
        // BigUInt.serialize() is big-endian; strip any leading zero byte so the
        // result is minimal (and zero collapses to the empty string → 0x80).
        return .bytes(Data(value.serialize().drop { $0 == 0 }))
    }

    static func encode(_ item: Item) -> Data {
        switch item {
        case let .bytes(data):
            return encodeBytes(data)
        case let .list(items):
            var payload = Data()
            for it in items { payload.append(encode(it)) }
            return encodeLength(payload.count, offset: 0xc0) + payload
        }
    }

    // MARK: - Private

    private static func encodeBytes(_ data: Data) -> Data {
        // A single byte < 0x80 is its own encoding (no length prefix).
        if data.count == 1, data[data.startIndex] < 0x80 { return data }
        return encodeLength(data.count, offset: 0x80) + data
    }

    private static func encodeLength(_ length: Int, offset: UInt8) -> Data {
        if length < 56 {
            return Data([offset + UInt8(length)])
        }
        let lenBytes = minimalBigEndian(length)
        return Data([offset + 55 + UInt8(lenBytes.count)]) + lenBytes
    }

    private static func minimalBigEndian(_ value: Int) -> Data {
        precondition(value >= 0)
        var v = value
        var out = [UInt8]()
        while v > 0 { out.insert(UInt8(v & 0xff), at: 0); v >>= 8 }
        return Data(out)
    }
}
