//
//  PasswordGenerator.swift
//  P2 — two modes:
//    - random:        CSPRNG-backed, for stored passwords
//    - deterministic: AuthBoxCrypto.Seed.derivePassword (seed + site → password),
//                     reproducible from the seed with no storage ("empty vault").
//

import Foundation
import AuthBoxCrypto

enum PasswordGenerator {
    static let lower = "abcdefghijklmnopqrstuvwxyz"
    static let upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    static let digits = "0123456789"
    static let symbols = "!@#$%^&*()-_=+[]{};:,.?"

    struct Options {
        var length = 20
        var lowercase = true
        var uppercase = true
        var digits = true
        var symbols = true
    }

    /// Cryptographically-random password using the system CSPRNG.
    static func random(_ opts: Options = Options()) -> String {
        var charset = ""
        if opts.lowercase { charset += lower }
        if opts.uppercase { charset += upper }
        if opts.digits { charset += digits }
        if opts.symbols { charset += symbols }
        guard !charset.isEmpty, opts.length > 0 else { return "" }
        let chars = Array(charset)
        var rng = SystemRandomNumberGenerator()
        return String((0..<opts.length).map { _ in chars[Int.random(in: 0..<chars.count, using: &rng)] })
    }

    /// Deterministic password derived from the seed + site (no storage needed).
    /// Delegates to AuthBoxCrypto so macOS and web/iOS produce identical output.
    static func deterministic(seed: Data, site: String, _ opts: Options = Options()) -> String {
        let derived = DerivePasswordOptions(
            length: opts.length, lowercase: opts.lowercase, uppercase: opts.uppercase,
            digits: opts.digits, symbols: opts.symbols, counter: 0
        )
        return Seed.derivePassword(seed: seed, site: site, options: derived)
    }
}
