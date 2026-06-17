import Foundation
import Testing
import BigInt
@testable import AuthBoxCrypto

/// RLP encoding anchored to the canonical vectors from the Ethereum wiki /
/// yellowpaper. RLP is the foundation of EIP-1559 tx serialization; a wrong byte
/// here changes the tx hash and thus the recovered sender — a silent loss of
/// funds. The integer cases pin the #1 footgun: zero is the empty string (0x80),
/// not 0x00.
@Suite("RLP encoding")
struct RLPTests {

    private func hex(_ item: RLP.Item) -> String {
        RLP.encode(item).map { String(format: "%02x", $0) }.joined()
    }

    @Test("byte strings")
    func byteStrings() {
        // "dog"
        #expect(hex(.bytes(Data("dog".utf8))) == "83646f67")
        // empty string -> 0x80
        #expect(hex(.bytes(Data())) == "80")
        // single byte 0x00 stays 0x00 (it's a 1-byte string < 0x80, self-encoding)
        #expect(hex(.bytes(Data([0x00]))) == "00")
        // single byte 0x0f -> 0x0f
        #expect(hex(.bytes(Data([0x0f]))) == "0f")
        // single byte 0x80 needs a prefix -> 0x8180
        #expect(hex(.bytes(Data([0x80]))) == "8180")
        // two bytes 0x0400 -> 0x820400
        #expect(hex(.bytes(Data([0x04, 0x00]))) == "820400")
    }

    @Test("long string crosses the 55-byte boundary")
    func longString() {
        let s = "Lorem ipsum dolor sit amet, consectetur adipisicing elit" // 56 bytes
        #expect(s.utf8.count == 56)
        let encoded = RLP.encode(.bytes(Data(s.utf8)))
        // 0xb8 (long-string, 1 length byte) + 0x38 (=56) + the bytes
        #expect(encoded.prefix(2).map { String(format: "%02x", $0) }.joined() == "b838")
        #expect(encoded.count == 58)
    }

    @Test("lists")
    func lists() {
        // empty list -> 0xc0
        #expect(hex(.list([])) == "c0")
        // ["cat","dog"] -> 0xc88363617483646f67
        let catDog = RLP.Item.list([.bytes(Data("cat".utf8)), .bytes(Data("dog".utf8))])
        #expect(hex(catDog) == "c88363617483646f67")
    }

    @Test("integers encode as minimal big-endian (zero -> 0x80)")
    func integers() {
        #expect(hex(RLP.bytes(BigUInt(0))) == "80")        // the footgun: zero is empty
        #expect(hex(RLP.bytes(BigUInt(1))) == "01")
        #expect(hex(RLP.bytes(BigUInt(15))) == "0f")
        #expect(hex(RLP.bytes(BigUInt(1024))) == "820400") // 0x0400, no leading zero
        #expect(hex(RLP.bytes(BigUInt(0x7f))) == "7f")
        #expect(hex(RLP.bytes(BigUInt(0x80))) == "8180")   // needs a length prefix
        // a realistic wei value: 0.1 ETH = 100000000000000000 = 0x016345785d8a0000
        #expect(hex(RLP.bytes(BigUInt("100000000000000000"))) == "88016345785d8a0000")
    }
}
