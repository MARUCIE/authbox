import Foundation

/// RIPEMD-160, vendored because CryptoKit ships only SHA-2. Used solely for the
/// Bitcoin hash160 (RIPEMD160(SHA256(pubkey))). Correctness is pinned to public
/// vectors in the tests (ripemd160("") == 9c1185…8d31, "abc" == 8eb208…0bfc).
enum RIPEMD160 {

    static func hash(_ message: Data) -> Data {
        var h0: UInt32 = 0x67452301
        var h1: UInt32 = 0xEFCDAB89
        var h2: UInt32 = 0x98BADCFE
        var h3: UInt32 = 0x10325476
        var h4: UInt32 = 0xC3D2E1F0

        // Padding: append 0x80, zero-fill to 56 mod 64, then 64-bit LE bit length.
        var msg = [UInt8](message)
        let bitLen = UInt64(msg.count) * 8
        msg.append(0x80)
        while msg.count % 64 != 56 { msg.append(0x00) }
        for i in 0..<8 { msg.append(UInt8((bitLen >> (8 * UInt64(i))) & 0xFF)) }

        var block = 0
        while block < msg.count {
            var x = [UInt32](repeating: 0, count: 16)
            for i in 0..<16 {
                let j = block + i * 4
                x[i] = UInt32(msg[j]) | (UInt32(msg[j + 1]) << 8) | (UInt32(msg[j + 2]) << 16) | (UInt32(msg[j + 3]) << 24)
            }

            var (al, bl, cl, dl, el) = (h0, h1, h2, h3, h4)
            var (ar, br, cr, dr, er) = (h0, h1, h2, h3, h4)

            for i in 0..<80 {
                // Left line
                var t = al &+ f(i, bl, cl, dl) &+ x[rl[i]] &+ kl[i]
                t = rotl(t, sl[i]) &+ el
                al = el; el = dl; dl = rotl(cl, 10); cl = bl; bl = t
                // Right line
                t = ar &+ f(79 - i, br, cr, dr) &+ x[rr[i]] &+ kr[i]
                t = rotl(t, sr[i]) &+ er
                ar = er; er = dr; dr = rotl(cr, 10); cr = br; br = t
            }

            let t = h1 &+ cl &+ dr
            h1 = h2 &+ dl &+ er
            h2 = h3 &+ el &+ ar
            h3 = h4 &+ al &+ br
            h4 = h0 &+ bl &+ cr
            h0 = t

            block += 64
        }

        var out = [UInt8]()
        for h in [h0, h1, h2, h3, h4] {
            for i in 0..<4 { out.append(UInt8((h >> (8 * UInt32(i))) & 0xFF)) }
        }
        return Data(out)
    }

    // MARK: - Round function + constants

    @inline(__always)
    private static func f(_ j: Int, _ x: UInt32, _ y: UInt32, _ z: UInt32) -> UInt32 {
        switch j {
        case 0..<16: return x ^ y ^ z
        case 16..<32: return (x & y) | (~x & z)
        case 32..<48: return (x | ~y) ^ z
        case 48..<64: return (x & z) | (y & ~z)
        default: return x ^ (y | ~z)
        }
    }

    @inline(__always)
    private static func rotl(_ x: UInt32, _ n: UInt32) -> UInt32 {
        (x << n) | (x >> (32 - n))
    }

    private static let kl: [UInt32] = blockConstants([0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E])
    private static let kr: [UInt32] = blockConstants([0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000])

    private static func blockConstants(_ k: [UInt32]) -> [UInt32] {
        var out = [UInt32]()
        for v in k { out.append(contentsOf: Array(repeating: v, count: 16)) }
        return out
    }

    private static let rl: [Int] = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
        3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
        1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
        4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
    ]
    private static let rr: [Int] = [
        5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
        6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
        15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
        8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
        12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
    ]
    private static let sl: [UInt32] = [
        11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
        7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
        11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
        11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
        9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
    ]
    private static let sr: [UInt32] = [
        8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
        9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
        9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
        15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
        8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
    ]
}
