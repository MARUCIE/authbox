import Foundation
import CryptoKit

/// Base58Check encoding for legacy Bitcoin addresses (p2pkh). payload =
/// version || data; checksum = first 4 bytes of SHA256(SHA256(payload)).
/// Vendored — no system primitive. Pinned to address vectors in the tests.
enum Base58Check {

    private static let alphabet = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")

    /// Encode `version || payload` with a 4-byte double-SHA256 checksum.
    static func encode(version: UInt8, payload: Data) -> String {
        var data = Data([version])
        data.append(payload)
        return encodeRaw(data)
    }

    /// Encode an already-prefixed payload (e.g. a 78-byte extended key, whose
    /// version is 4 bytes) with the 4-byte double-SHA256 checksum.
    static func encodeRaw(_ payload: Data) -> String {
        var data = payload
        data.append(contentsOf: doubleSHA256(data).prefix(4))
        return base58Encode(data)
    }

    // MARK: - Base58

    private static func base58Encode(_ data: Data) -> String {
        // Count leading zero bytes → leading '1's.
        var leadingZeros = 0
        for b in data { if b == 0 { leadingZeros += 1 } else { break } }

        // Big-endian base conversion via repeated division by 58.
        var digits: [Int] = [0]
        for byte in data {
            var carry = Int(byte)
            for i in 0..<digits.count {
                carry += digits[i] << 8
                digits[i] = carry % 58
                carry /= 58
            }
            while carry > 0 {
                digits.append(carry % 58)
                carry /= 58
            }
        }

        var result = String(repeating: "1", count: leadingZeros)
        for d in digits.reversed() { result.append(alphabet[d]) }
        return result
    }

    private static func doubleSHA256(_ data: Data) -> Data {
        Data(SHA256.hash(data: Data(SHA256.hash(data: data))))
    }
}
