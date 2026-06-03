import XCTest
@testable import AuthBoxCrypto

/// Proves the TOTP engine matches RFC 6238 — and therefore Google Authenticator
/// and Microsoft Authenticator, which implement the same spec. The Appendix B
/// test vectors are the canonical, independently-published proof of correctness.
final class TOTPTests: XCTestCase {

    // RFC 6238 Appendix B seeds (raw ASCII bytes, NOT base32).
    private let seedSHA1   = Data("12345678901234567890".utf8)                                        // 20 bytes
    private let seedSHA256 = Data("12345678901234567890123456789012".utf8)                            // 32 bytes
    private let seedSHA512 = Data("1234567890123456789012345678901234567890123456789012345678901234".utf8) // 64 bytes

    /// RFC 6238 Appendix B — every published vector, all three hash modes,
    /// 8-digit codes, 30-second period.
    func testRFC6238AppendixBVectors() {
        let cases: [(time: TimeInterval, sha1: String, sha256: String, sha512: String)] = [
            (59,          "94287082", "46119246", "90693936"),
            (1111111109,  "07081804", "68084774", "25091201"),
            (1111111111,  "14050471", "67062674", "99943326"),
            (1234567890,  "89005924", "91819424", "93441116"),
            (2000000000,  "69279037", "90698825", "38618901"),
            (20000000000, "65353130", "77737706", "47863826"),
        ]
        for c in cases {
            let date = Date(timeIntervalSince1970: c.time)
            let t1 = TOTP(secret: seedSHA1,   digits: 8, algorithm: .sha1)
            let t256 = TOTP(secret: seedSHA256, digits: 8, algorithm: .sha256)
            let t512 = TOTP(secret: seedSHA512, digits: 8, algorithm: .sha512)
            XCTAssertEqual(t1.code(at: date),   c.sha1,   "SHA1 @ \(c.time)")
            XCTAssertEqual(t256.code(at: date), c.sha256, "SHA256 @ \(c.time)")
            XCTAssertEqual(t512.code(at: date), c.sha512, "SHA512 @ \(c.time)")
        }
    }

    /// The Google/Microsoft Authenticator default profile: HMAC-SHA1, 6 digits,
    /// 30s. The 8-digit RFC vector truncated to 6 digits is the same low digits.
    func testGoogleAuthenticatorDefault6Digits() {
        let totp = TOTP(secret: seedSHA1)   // digits 6, sha1, period 30 — the default
        // RFC vector @59 is 94287082; the 6-digit code is its last 6 digits.
        XCTAssertEqual(totp.code(at: Date(timeIntervalSince1970: 59)), "287082")
        XCTAssertEqual(totp.code(at: Date(timeIntervalSince1970: 59)).count, 6)
    }

    /// Base32 (RFC 4648) — the encoding authenticator apps use for their secrets.
    func testBase32Decode() {
        // RFC 4648 §10 vector.
        XCTAssertEqual(TOTP.base32Decode("MZXW6YTBOI======"), Data("foobar".utf8))
        // Padding-free + lowercase + spaces are tolerated.
        XCTAssertEqual(TOTP.base32Decode("mzxw6ytboi"), Data("foobar".utf8))
        XCTAssertEqual(TOTP.base32Decode("MZXW 6YTB OI"), Data("foobar".utf8))
        // Invalid characters fail cleanly.
        XCTAssertNil(TOTP.base32Decode("0189!"))
    }

    /// Parse a real authenticator `otpauth://` URI (the QR-code payload).
    func testParseOtpauthURI() {
        let uri = "otpauth://totp/ACME%20Co:alice@acme.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&digits=6&period=30&algorithm=SHA1"
        let totp = TOTP.parse(uri)
        XCTAssertNotNil(totp)
        XCTAssertEqual(totp?.digits, 6)
        XCTAssertEqual(totp?.period, 30)
        XCTAssertEqual(totp?.algorithm, .sha1)
        XCTAssertEqual(totp?.issuer, "ACME Co")
        XCTAssertEqual(totp?.account, "alice@acme.com")
        XCTAssertEqual(totp?.secret, TOTP.base32Decode("JBSWY3DPEHPK3PXP"))
        // Produces a valid 6-digit numeric code.
        let code = totp!.code(at: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(code.count, 6)
        XCTAssertTrue(code.allSatisfy(\.isNumber))
    }

    /// A bare base32 secret (manual entry, no URI) is accepted too.
    func testParseBareSecret() {
        let totp = TOTP.parse("JBSWY3DPEHPK3PXP")
        XCTAssertNotNil(totp)
        XCTAssertEqual(totp?.digits, 6)
        XCTAssertEqual(totp?.secret, TOTP.base32Decode("JBSWY3DPEHPK3PXP"))
        XCTAssertNil(TOTP.parse("not valid base32 !!!"))
    }

    /// The code is stable within a step and rolls at the boundary.
    func testCodeStabilityAndRollover() {
        let totp = TOTP(secret: seedSHA1)
        let a = totp.code(at: Date(timeIntervalSince1970: 30))
        let b = totp.code(at: Date(timeIntervalSince1970: 59))   // same 30s step
        let c = totp.code(at: Date(timeIntervalSince1970: 60))   // next step
        XCTAssertEqual(a, b, "Code must be stable within a 30s window")
        XCTAssertNotEqual(b, c, "Code must change at the step boundary")
    }

    /// secondsRemaining counts down within (0, period].
    func testSecondsRemaining() {
        let totp = TOTP(secret: seedSHA1, period: 30)
        XCTAssertEqual(totp.secondsRemaining(at: Date(timeIntervalSince1970: 0)),  30)
        XCTAssertEqual(totp.secondsRemaining(at: Date(timeIntervalSince1970: 1)),  29)
        XCTAssertEqual(totp.secondsRemaining(at: Date(timeIntervalSince1970: 29)), 1)
        XCTAssertEqual(totp.secondsRemaining(at: Date(timeIntervalSince1970: 30)), 30)
    }
}
