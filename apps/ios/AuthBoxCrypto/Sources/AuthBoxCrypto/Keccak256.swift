import Foundation

/// Keccak-256 (the pre-standardisation variant Ethereum uses — padding byte
/// 0x01, NOT SHA-3's 0x06). CryptoKit exposes SHA-2 only, so this is vendored.
/// Correctness is pinned to public vectors in the tests
/// (keccak256("") == c5d246…a470).
enum Keccak256 {

    static func hash(_ input: Data) -> Data {
        var state = [UInt64](repeating: 0, count: 25)
        let rate = 136 // 1088-bit rate for Keccak-256 (= 200 - 2*32)

        // Absorb
        var message = [UInt8](input)
        // pad10*1: append 0x01, zero-fill, set high bit of the last rate byte
        message.append(0x01)
        while message.count % rate != 0 { message.append(0x00) }
        message[message.count - 1] |= 0x80

        var offset = 0
        while offset < message.count {
            for i in 0..<(rate / 8) {
                var lane: UInt64 = 0
                for b in 0..<8 {
                    lane |= UInt64(message[offset + i * 8 + b]) << (8 * b)
                }
                state[i] ^= lane
            }
            keccakF(&state)
            offset += rate
        }

        // Squeeze first 32 bytes
        var out = [UInt8]()
        out.reserveCapacity(32)
        for i in 0..<4 {
            let lane = state[i]
            for b in 0..<8 { out.append(UInt8((lane >> (8 * b)) & 0xFF)) }
        }
        return Data(out)
    }

    // MARK: - Keccak-f[1600]

    private static let rotc: [UInt64] = [
        1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14,
        27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
    ]
    private static let piln: [Int] = [
        10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4,
        15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
    ]
    private static let rndc: [UInt64] = [
        0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000,
        0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
        0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
        0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
        0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
        0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
    ]

    @inline(__always)
    private static func rotl(_ x: UInt64, _ n: UInt64) -> UInt64 {
        (x << n) | (x >> (64 - n))
    }

    private static func keccakF(_ st: inout [UInt64]) {
        var bc = [UInt64](repeating: 0, count: 5)
        for round in 0..<24 {
            // Theta
            for i in 0..<5 { bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20] }
            for i in 0..<5 {
                let t = bc[(i + 4) % 5] ^ rotl(bc[(i + 1) % 5], 1)
                var j = 0
                while j < 25 { st[j + i] ^= t; j += 5 }
            }
            // Rho + Pi
            var t = st[1]
            for i in 0..<24 {
                let j = piln[i]
                bc[0] = st[j]
                st[j] = rotl(t, rotc[i])
                t = bc[0]
            }
            // Chi
            var j = 0
            while j < 25 {
                for i in 0..<5 { bc[i] = st[j + i] }
                for i in 0..<5 { st[j + i] ^= (~bc[(i + 1) % 5]) & bc[(i + 2) % 5] }
                j += 5
            }
            // Iota
            st[0] ^= rndc[round]
        }
    }
}
