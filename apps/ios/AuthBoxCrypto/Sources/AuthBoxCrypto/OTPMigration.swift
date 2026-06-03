import Foundation

/// Importing existing 2FA accounts into the vault.
///
/// Two ingestion surfaces, one output type (`[TOTP]`):
///  - `otpauth-migration://offline?data=...` — Google Authenticator's "Export
///    accounts" / "Transfer accounts" QR. The `data` param is base64 of a
///    protobuf `MigrationPayload` that carries many accounts in one code.
///  - One or more `otpauth://totp/...` URIs (or bare base32 secrets), one per
///    line — the single-account QR most services show, or a pasted list.
///
/// The migration protobuf is decoded by a minimal, dependency-free wire-format
/// reader (no SwiftProtobuf) — the same "implement the standard by hand, keep it
/// testable" posture as `TOTP` itself.
public enum OTPImport {

    /// Parse any scanned/pasted authenticator string into the TOTP accounts it
    /// carries. Handles a migration URI, a single `otpauth://` URI, or a
    /// newline-separated list. Invalid entries are skipped, never fatal.
    public static func parse(_ raw: String) -> [TOTP] {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        if trimmed.lowercased().hasPrefix("otpauth-migration://") {
            return parseMigration(trimmed)
        }
        // One-or-many otpauth:// URIs / bare secrets, split on line breaks.
        return trimmed
            .split(whereSeparator: \.isNewline)
            .compactMap { TOTP.parse(String($0)) }
    }

    /// Decode a Google Authenticator `otpauth-migration://offline?data=...` URI
    /// into the accounts it carries.
    public static func parseMigration(_ raw: String) -> [TOTP] {
        guard let comps = URLComponents(string: raw),
              let dataParam = (comps.queryItems ?? [])
                  .first(where: { $0.name.lowercased() == "data" })?.value
        else { return [] }

        // URLComponents already percent-decodes the value; Google's payload is
        // standard base64 (may contain '+' and '/'). Try direct, then a cleaned
        // pass that tolerates whitespace and missing padding.
        guard let payload = base64Decode(dataParam) else { return [] }
        return decodeMigrationPayload(payload)
    }

    private static func base64Decode(_ s: String) -> Data? {
        if let d = Data(base64Encoded: s) { return d }
        var cleaned = s.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
        // Pad to a multiple of 4 so unpadded payloads still decode.
        let remainder = cleaned.count % 4
        if remainder > 0 { cleaned += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: cleaned)
    }

    // MARK: - Protobuf decode (otpauth-migration MigrationPayload)

    /// `MigrationPayload { repeated OtpParameters otp_parameters = 1; ... }`
    static func decodeMigrationPayload(_ data: Data) -> [TOTP] {
        var reader = ProtobufReader(data)
        var totps: [TOTP] = []
        while let field = reader.nextField() {
            // Field 1 = repeated OtpParameters (length-delimited).
            if field.number == 1, case let .lengthDelimited(bytes) = field.value {
                if let totp = decodeOtpParameters(bytes) { totps.append(totp) }
            }
        }
        return totps
    }

    /// `OtpParameters { bytes secret = 1; string name = 2; string issuer = 3;`
    /// ` Algorithm algorithm = 4; DigitCount digits = 5; OtpType type = 6; }`
    ///
    /// Algorithm: 1 SHA1, 2 SHA256, 3 SHA512, 4 MD5 (unsupported → skip).
    /// DigitCount: 1 six, 2 eight. OtpType: 1 HOTP (skip — TOTP is time-based), 2 TOTP.
    private static func decodeOtpParameters(_ data: Data) -> TOTP? {
        var reader = ProtobufReader(data)
        var secret = Data()
        var name: String?
        var issuer: String?
        var algorithm: TOTP.Algorithm = .sha1
        var digits = 6
        var isTotp = true

        while let field = reader.nextField() {
            switch (field.number, field.value) {
            case (1, .lengthDelimited(let b)): secret = b
            case (2, .lengthDelimited(let b)): name = String(data: b, encoding: .utf8)
            case (3, .lengthDelimited(let b)): issuer = String(data: b, encoding: .utf8)
            case (4, .varint(let v)):
                switch v {
                case 1: algorithm = .sha1
                case 2: algorithm = .sha256
                case 3: algorithm = .sha512
                default: return nil   // MD5 / unspecified — not supported, skip the account
                }
            case (5, .varint(let v)): digits = (v == 2) ? 8 : 6
            case (6, .varint(let v)): isTotp = (v != 1)   // 1 = HOTP
            default: break
            }
        }

        guard !secret.isEmpty, isTotp else { return nil }
        // The migration payload carries no period; Google Authenticator uses 30s.
        return TOTP(
            secret: secret,
            digits: digits,
            period: 30,
            algorithm: algorithm,
            issuer: (issuer?.isEmpty == false) ? issuer : nil,
            account: name
        )
    }
}

/// Minimal protobuf wire-format reader — only the two wire types the migration
/// payload uses: varint (0) and length-delimited (2). 32-/64-bit fields are
/// skipped and unknown wire types stop the read, so newer export versions
/// degrade gracefully instead of crashing.
struct ProtobufReader {
    enum Value: Equatable {
        case varint(UInt64)
        case lengthDelimited(Data)
    }
    struct Field { let number: Int; let value: Value }

    private let data: Data
    private var index: Int

    /// Re-base into a contiguous, zero-indexed buffer so `Data` slices (whose
    /// `startIndex` may be non-zero) can't corrupt offset math.
    init(_ data: Data) {
        self.data = Data(data)
        self.index = 0
    }

    mutating func nextField() -> Field? {
        guard let key = readVarint() else { return nil }
        let number = Int(key >> 3)
        let wireType = Int(key & 0x07)
        switch wireType {
        case 0:                                   // varint
            guard let v = readVarint() else { return nil }
            return Field(number: number, value: .varint(v))
        case 2:                                   // length-delimited
            guard let len = readVarint(), let bytes = read(Int(len)) else { return nil }
            return Field(number: number, value: .lengthDelimited(bytes))
        case 5:                                   // 32-bit fixed — skip
            guard read(4) != nil else { return nil }
            return nextField()
        case 1:                                   // 64-bit fixed — skip
            guard read(8) != nil else { return nil }
            return nextField()
        default:                                  // group / unknown — stop
            return nil
        }
    }

    private mutating func readVarint() -> UInt64? {
        var result: UInt64 = 0
        var shift: UInt64 = 0
        while index < data.count {
            let byte = data[index]
            index += 1
            result |= UInt64(byte & 0x7f) << shift
            if byte & 0x80 == 0 { return result }
            shift += 7
            if shift >= 64 { return nil }
        }
        return nil
    }

    private mutating func read(_ n: Int) -> Data? {
        guard n >= 0, index + n <= data.count else { return nil }
        let sub = data.subdata(in: index..<(index + n))
        index += n
        return sub
    }
}
