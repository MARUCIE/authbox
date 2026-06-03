import Foundation

/// Bech32 (BIP-173) encoding for native-segwit v0 addresses (p2wpkh). Witness
/// version 0 uses the original bech32 checksum constant (1); bech32m is only for
/// v1+. Vendored — there is no system primitive. Pinned to address vectors in
/// the tests.
enum Bech32 {

    private static let charset = Array("qpzry9x8gf2tvdw0s3jn54khce6mua7l")

    /// Encode a v0 witness program (20-byte hash160 for p2wpkh) as a segwit
    /// address. `hrp` is "bc" (mainnet) or "tb" (testnet).
    static func encodeSegwit(hrp: String, version: UInt8, program: Data) -> String {
        var data: [UInt8] = [version]
        data.append(contentsOf: convertBits(Array(program), from: 8, to: 5, pad: true))
        return encode(hrp: hrp, data: data)
    }

    // MARK: - Core bech32

    private static func encode(hrp: String, data: [UInt8]) -> String {
        let checksum = createChecksum(hrp: hrp, data: data)
        var result = hrp + "1"
        for d in data + checksum { result.append(charset[Int(d)]) }
        return result
    }

    private static func polymod(_ values: [UInt8]) -> UInt32 {
        let gen: [UInt32] = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
        var chk: UInt32 = 1
        for v in values {
            let b = chk >> 25
            chk = ((chk & 0x1ffffff) << 5) ^ UInt32(v)
            for i in 0..<5 where (b >> i) & 1 == 1 { chk ^= gen[i] }
        }
        return chk
    }

    private static func hrpExpand(_ hrp: String) -> [UInt8] {
        let bytes = Array(hrp.utf8)
        var out = bytes.map { $0 >> 5 }
        out.append(0)
        out.append(contentsOf: bytes.map { $0 & 31 })
        return out
    }

    private static func createChecksum(hrp: String, data: [UInt8]) -> [UInt8] {
        let values = hrpExpand(hrp) + data + [0, 0, 0, 0, 0, 0]
        let mod = polymod(values) ^ 1 // bech32 constant for witver 0
        return (0..<6).map { UInt8((mod >> (5 * (5 - $0))) & 31) }
    }

    /// Regroup a byte stream from `from`-bit to `to`-bit units (8→5 for encoding).
    static func convertBits(_ data: [UInt8], from: Int, to: Int, pad: Bool) -> [UInt8] {
        var acc = 0
        var bits = 0
        var out = [UInt8]()
        let maxv = (1 << to) - 1
        for value in data {
            acc = (acc << from) | Int(value)
            bits += from
            while bits >= to {
                bits -= to
                out.append(UInt8((acc >> bits) & maxv))
            }
        }
        if pad && bits > 0 {
            out.append(UInt8((acc << (to - bits)) & maxv))
        }
        return out
    }
}
