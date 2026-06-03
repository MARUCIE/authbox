import XCTest
@testable import AuthBoxCrypto

/// Proves the authenticator import surface — single `otpauth://`, pasted lists,
/// and Google Authenticator's `otpauth-migration://` protobuf export.
///
/// The protobuf decoder is proven two ways that can't both be wrong the same
/// way: (1) the bytes are assembled by an in-test encoder that writes the raw
/// protobuf wire format (tag = field << 3 | wireType), so a decode bug shows up
/// as a structural mismatch; (2) the decoded secret is fed through the already
/// RFC-6238-proven `TOTP` engine and must yield the canonical code "287082" at
/// t=59 — a mis-handled secret byte would change that number.
final class OTPMigrationTests: XCTestCase {

    // MARK: - Protobuf wire-format encoder (test-only, documents the format)

    private func varint(_ value: UInt64) -> [UInt8] {
        var v = value
        var out = [UInt8]()
        repeat {
            var byte = UInt8(v & 0x7f)
            v >>= 7
            if v != 0 { byte |= 0x80 }
            out.append(byte)
        } while v != 0
        return out
    }

    /// Length-delimited field (wire type 2): tag, length varint, then bytes.
    private func lenField(_ field: Int, _ bytes: [UInt8]) -> [UInt8] {
        [UInt8(field << 3 | 2)] + varint(UInt64(bytes.count)) + bytes
    }

    /// Varint field (wire type 0): tag, then the value varint.
    private func varintField(_ field: Int, _ value: UInt64) -> [UInt8] {
        [UInt8(field << 3 | 0)] + varint(value)
    }

    /// One `OtpParameters` message. `algorithm`/`digits`/`type` use Google's
    /// migration enum values (1 SHA1, 1 six, 2 totp by default).
    private func otpParameters(
        secret: [UInt8], name: String, issuer: String,
        algorithm: UInt64 = 1, digits: UInt64 = 1, type: UInt64 = 2
    ) -> [UInt8] {
        lenField(1, secret)
            + lenField(2, Array(name.utf8))
            + lenField(3, Array(issuer.utf8))
            + varintField(4, algorithm)
            + varintField(5, digits)
            + varintField(6, type)
    }

    /// Wrap one or more `OtpParameters` in a `MigrationPayload` and produce the
    /// full `otpauth-migration://offline?data=...` URI Google Authenticator emits.
    private func migrationURI(_ parameters: [[UInt8]]) -> String {
        var payload = [UInt8]()
        for p in parameters { payload += lenField(1, p) }      // field 1 = repeated otp_parameters
        payload += varintField(2, 1)                           // field 2 = version = 1
        let b64 = Data(payload).base64EncodedString()
        let encoded = b64.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? b64
        return "otpauth-migration://offline?data=\(encoded)"
    }

    /// The RFC 6238 SHA1 seed "12345678901234567890" as raw bytes (what the
    /// migration payload stores — raw, not base32).
    private var rfcSeed: [UInt8] { Array("12345678901234567890".utf8) }

    // MARK: - Migration decode

    func testMigrationSingleAccountDecodesAndMatchesRFC() {
        let uri = migrationURI([
            otpParameters(secret: rfcSeed, name: "alice@google.com", issuer: "Example")
        ])

        let totps = OTPImport.parse(uri)
        XCTAssertEqual(totps.count, 1, "One account must decode from the migration payload")

        let totp = totps[0]
        XCTAssertEqual(totp.issuer, "Example")
        XCTAssertEqual(totp.account, "alice@google.com")
        XCTAssertEqual(totp.digits, 6)
        XCTAssertEqual(totp.period, 30)
        XCTAssertEqual(totp.algorithm, .sha1)
        // RFC 6238 anchor: this exact secret yields 287082 at t=59 (proven in TOTPTests).
        XCTAssertEqual(totp.code(at: Date(timeIntervalSince1970: 59)), "287082",
                       "Decoded secret must reproduce the RFC 6238 reference code")
    }

    func testMigrationMultipleAccountsPreserveOrder() {
        let uri = migrationURI([
            otpParameters(secret: rfcSeed, name: "first@acme.com", issuer: "Acme"),
            otpParameters(secret: rfcSeed, name: "second@acme.com", issuer: "Acme", digits: 2) // eight
        ])

        let totps = OTPImport.parse(uri)
        XCTAssertEqual(totps.count, 2)
        XCTAssertEqual(totps[0].account, "first@acme.com")
        XCTAssertEqual(totps[1].account, "second@acme.com")
        XCTAssertEqual(totps[1].digits, 8, "DigitCount = 2 must map to eight digits")
    }

    func testMigrationSkipsHotpAndUnsupportedAlgorithm() {
        let uri = migrationURI([
            otpParameters(secret: rfcSeed, name: "totp@x.com", issuer: "X"),
            otpParameters(secret: rfcSeed, name: "hotp@x.com", issuer: "X", type: 1),      // HOTP → skip
            otpParameters(secret: rfcSeed, name: "md5@x.com", issuer: "X", algorithm: 4)   // MD5 → skip
        ])

        let totps = OTPImport.parse(uri)
        XCTAssertEqual(totps.count, 1, "HOTP and MD5 accounts must be skipped, TOTP kept")
        XCTAssertEqual(totps[0].account, "totp@x.com")
    }

    func testMalformedMigrationDataReturnsEmpty() {
        XCTAssertTrue(OTPImport.parse("otpauth-migration://offline?data=not!base64!").isEmpty)
        XCTAssertTrue(OTPImport.parse("otpauth-migration://offline").isEmpty)
    }

    // MARK: - otpauth:// list import

    func testSingleOtpauthURI() {
        let totps = OTPImport.parse(
            "otpauth://totp/GitHub:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub")
        XCTAssertEqual(totps.count, 1)
        XCTAssertEqual(totps[0].issuer, "GitHub")
    }

    func testMultilineMixedList() {
        let blob = """
        otpauth://totp/A:a?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=A
        otpauth://totp/B:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=B
        GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
        """
        let totps = OTPImport.parse(blob)
        XCTAssertEqual(totps.count, 3, "Two URIs plus one bare base32 secret")
        XCTAssertEqual(totps[0].issuer, "A")
        XCTAssertEqual(totps[1].issuer, "B")
    }

    func testEmptyInput() {
        XCTAssertTrue(OTPImport.parse("   \n  ").isEmpty)
    }

    // MARK: - otpauthURI round-trip (storage form for scanned/migrated accounts)

    func testBase32EncodeRFC4648Vector() {
        // RFC 4648 §10: base32("foobar") = "MZXW6YTBOI======" (padding optional here).
        XCTAssertEqual(TOTP.base32Encode(Data("foobar".utf8)), "MZXW6YTBOI")
        XCTAssertEqual(TOTP.base32Encode(Data()), "")
    }

    func testOtpauthURIRoundTripsThroughParse() {
        // A migration-decoded account (no original URI) must serialize to an
        // otpauth:// URI that parses back to an equivalent, code-identical account.
        let original = OTPImport.parse(
            migrationURI([otpParameters(secret: rfcSeed, name: "alice@google.com", issuer: "Example")])
        )[0]

        let reparsed = TOTP.parse(original.otpauthURI())
        XCTAssertNotNil(reparsed)
        XCTAssertEqual(reparsed?.issuer, "Example")
        XCTAssertEqual(reparsed?.account, "alice@google.com")
        XCTAssertEqual(reparsed?.secret, original.secret)
        XCTAssertEqual(reparsed?.code(at: Date(timeIntervalSince1970: 59)), "287082")
    }
}
