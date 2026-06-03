import Foundation
import CryptoKit

/// RFC 6238 Time-based One-Time Password generator.
///
/// Produces the same rotating codes as Google Authenticator and Microsoft
/// Authenticator (default: HMAC-SHA1, 6 digits, 30-second period). The secret is
/// raw key bytes; use `base32Decode` / `parse(_:)` to ingest the base32 secrets
/// and `otpauth://` URIs those apps emit from their QR codes.
public struct TOTP: Equatable {

    public enum Algorithm: String, Equatable {
        case sha1   = "SHA1"
        case sha256 = "SHA256"
        case sha512 = "SHA512"
    }

    /// Raw HMAC key bytes (NOT base32). Use `base32Decode` to convert.
    public let secret: Data
    public let digits: Int
    public let period: Int
    public let algorithm: Algorithm
    public let issuer: String?
    public let account: String?

    public init(
        secret: Data,
        digits: Int = 6,
        period: Int = 30,
        algorithm: Algorithm = .sha1,
        issuer: String? = nil,
        account: String? = nil
    ) {
        self.secret = secret
        self.digits = digits
        self.period = period
        self.algorithm = algorithm
        self.issuer = issuer
        self.account = account
    }

    // MARK: - Code generation

    /// The current TOTP code, zero-padded to `digits`.
    public func code(at date: Date = Date()) -> String {
        let counter = UInt64(floor(date.timeIntervalSince1970 / Double(period)))
        return hotp(counter: counter)
    }

    /// Seconds until the current code rolls over (1...period).
    public func secondsRemaining(at date: Date = Date()) -> Int {
        let elapsed = Int(date.timeIntervalSince1970) % period
        return period - elapsed
    }

    /// RFC 4226 HOTP for a given counter — the per-step primitive TOTP wraps.
    public func hotp(counter: UInt64) -> String {
        var bigEndian = counter.bigEndian
        let counterData = withUnsafeBytes(of: &bigEndian) { Data($0) }
        let key = SymmetricKey(data: secret)

        let mac: Data
        switch algorithm {
        case .sha1:
            mac = Data(HMAC<Insecure.SHA1>.authenticationCode(for: counterData, using: key))
        case .sha256:
            mac = Data(HMAC<SHA256>.authenticationCode(for: counterData, using: key))
        case .sha512:
            mac = Data(HMAC<SHA512>.authenticationCode(for: counterData, using: key))
        }

        // Dynamic truncation (RFC 4226 §5.3).
        let offset = Int(mac[mac.count - 1] & 0x0f)
        let binary =
            (UInt32(mac[offset] & 0x7f) << 24) |
            (UInt32(mac[offset + 1]) << 16) |
            (UInt32(mac[offset + 2]) << 8) |
            (UInt32(mac[offset + 3]))

        let modulo = UInt32(pow(10, Double(digits)))
        let number = binary % modulo
        return String(format: "%0\(digits)d", number)
    }

    /// The code split into two groups for display, e.g. "123 456".
    public func formattedCode(at date: Date = Date()) -> String {
        let c = code(at: date)
        guard c.count == 6 || c.count == 8 else { return c }
        let mid = c.index(c.startIndex, offsetBy: c.count / 2)
        return "\(c[c.startIndex..<mid]) \(c[mid...])"
    }

    // MARK: - Parsing

    /// Parse an `otpauth://totp/...` URI (as encoded in an authenticator QR
    /// code) OR a bare base32 secret. Returns nil if no valid secret is found.
    public static func parse(_ raw: String) -> TOTP? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        // Bare base32 secret (no scheme).
        if !trimmed.lowercased().hasPrefix("otpauth://") {
            guard let secret = base32Decode(trimmed), !secret.isEmpty else { return nil }
            return TOTP(secret: secret)
        }

        guard let comps = URLComponents(string: trimmed),
              comps.host?.lowercased() == "totp" else { return nil }
        let query = Dictionary(uniqueKeysWithValues:
            (comps.queryItems ?? []).map { ($0.name.lowercased(), $0.value ?? "") })

        guard let secretB32 = query["secret"],
              let secret = base32Decode(secretB32), !secret.isEmpty else { return nil }

        let digits = query["digits"].flatMap { Int($0) } ?? 6
        let period = query["period"].flatMap { Int($0) } ?? 30
        let algo = query["algorithm"].flatMap { Algorithm(rawValue: $0.uppercased()) } ?? .sha1

        // Label = "/Issuer:account"; issuer query param overrides the label prefix.
        var issuer = query["issuer"].flatMap { $0.isEmpty ? nil : $0 }
        var account: String?
        let label = comps.path.hasPrefix("/") ? String(comps.path.dropFirst()) : comps.path
        let decodedLabel = label.removingPercentEncoding ?? label
        if !decodedLabel.isEmpty {
            if let colon = decodedLabel.firstIndex(of: ":") {
                if issuer == nil { issuer = String(decodedLabel[..<colon]) }
                account = String(decodedLabel[decodedLabel.index(after: colon)...])
                    .trimmingCharacters(in: .whitespaces)
            } else {
                account = decodedLabel
            }
        }

        return TOTP(secret: secret, digits: digits, period: period,
                    algorithm: algo, issuer: issuer, account: account)
    }

    // MARK: - Base32 (RFC 4648, no padding required)

    private static let base32Alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")

    /// Decode an RFC 4648 base32 string (case-insensitive, padding and spaces
    /// tolerated) into raw bytes. Returns nil on an invalid character.
    public static func base32Decode(_ string: String) -> Data? {
        let cleaned = string
            .uppercased()
            .replacingOccurrences(of: "=", with: "")
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
        guard !cleaned.isEmpty else { return nil }

        var lookup = [Character: UInt8]()
        for (i, c) in base32Alphabet.enumerated() { lookup[c] = UInt8(i) }

        var bits = 0
        var value = 0
        var output = [UInt8]()
        for char in cleaned {
            guard let v = lookup[char] else { return nil }
            value = (value << 5) | Int(v)
            bits += 5
            if bits >= 8 {
                bits -= 8
                output.append(UInt8((value >> bits) & 0xff))
            }
        }
        return Data(output)
    }
}
