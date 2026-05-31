import CryptoKit
import Foundation
import BigInt

/// SRP-6a client implementation using BigInt.
///
/// Mirrors `@authbox/crypto` srp.ts exactly:
/// - Group: RFC 5054 2048-bit (Group 14), g = 2
/// - Hash: SHA-256 throughout
/// - N byte length: 256 (2048 bits)
///
/// SRP lets the client prove knowledge of the password without sending it.
/// The server stores only a verifier, not the password.
public enum SRP {

    // MARK: - Constants (RFC 5054, 2048-bit group 14)

    private static let N_HEX =
        "AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050" +
        "A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50" +
        "E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8" +
        "55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B" +
        "CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748" +
        "544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6" +
        "AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6" +
        "94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73"

    // swiftlint:disable:next identifier_name
    private static let N = BigUInt(N_HEX, radix: 16)!
    private static let g = BigUInt(2)
    private static let nByteLength = 256

    // MARK: - Utility Functions

    private static func bigUIntToData(_ n: BigUInt, length: Int) -> Data {
        let bytes = n.serialize()
        if bytes.count >= length {
            return Data(bytes.suffix(length))
        }
        var padded = Data(count: length - bytes.count)
        padded.append(bytes)
        return padded
    }

    private static func dataToBigUInt(_ data: Data) -> BigUInt {
        BigUInt(data)
    }

    private static func hashSHA256(_ inputs: Data...) -> Data {
        var combined = Data()
        for input in inputs {
            combined.append(input)
        }
        return Data(SHA256.hash(data: combined))
    }

    /// Compute x = H(salt || H(email || ":" || password))
    private static func computeX(email: String, password: String, salt: Data) -> BigUInt {
        let innerInput = Data((email + ":" + password).utf8)
        let innerHash = hashSHA256(innerInput)
        let xHash = hashSHA256(salt, innerHash)
        return dataToBigUInt(xHash)
    }

    /// Compute k = H(N || PAD(g))
    private static func computeK() -> BigUInt {
        let nBytes = bigUIntToData(N, length: nByteLength)
        let gBytes = bigUIntToData(g, length: nByteLength)
        return dataToBigUInt(hashSHA256(nBytes, gBytes))
    }

    /// Compute u = H(PAD(A) || PAD(B))
    private static func computeU(_ A: BigUInt, _ B: BigUInt) -> BigUInt {
        let aBytes = bigUIntToData(A, length: nByteLength)
        let bBytes = bigUIntToData(B, length: nByteLength)
        return dataToBigUInt(hashSHA256(aBytes, bBytes))
    }

    // MARK: - Public API

    /// Generate SRP verifier for registration.
    /// verifier = g^x mod N
    public static func generateVerifier(
        email: String,
        password: String,
        salt: Data
    ) -> (salt: Data, verifier: Data) {
        let x = computeX(email: email, password: password, salt: salt)
        let verifier = g.power(x, modulus: N)
        return (salt: Data(salt), verifier: bigUIntToData(verifier, length: nByteLength))
    }

    /// Login step 1: generate client ephemeral key pair.
    /// a = random 32 bytes, A = g^a mod N
    ///
    /// Retries if A mod N == 0 (SRP safety check).
    public static func clientInit() -> SRPClientState {
        var a: BigUInt
        var A: BigUInt

        repeat {
            var aBytes = Data(count: 32)
            aBytes.withUnsafeMutableBytes { ptr in
                _ = SecRandomCopyBytes(kSecRandomDefault, 32, ptr.baseAddress!)
            }
            a = dataToBigUInt(aBytes)
            A = g.power(a, modulus: N)
        } while A == 0

        return SRPClientState(
            ephemeralSecret: bigUIntToData(a, length: 32),
            ephemeralPublic: bigUIntToData(A, length: nByteLength)
        )
    }

    /// Login step 2: compute client proof M1 and session key K.
    ///
    /// Given the server's (salt, B):
    /// 1. Compute x, u, k
    /// 2. S = (B - k * g^x) ^ (a + u*x) mod N
    /// 3. K = H(S)
    /// 4. M1 = H(A || B || K)
    ///
    /// - Throws: If B mod N == 0 or u == 0
    public static func clientVerify(
        state: SRPClientState,
        email: String,
        password: String,
        salt: Data,
        serverPublicB: Data
    ) throws -> (clientProof: Data, sessionKey: Data) {
        let a = dataToBigUInt(state.ephemeralSecret)
        let A = dataToBigUInt(state.ephemeralPublic)
        let B = dataToBigUInt(serverPublicB)

        // Safety check
        guard B % N != 0 else {
            throw SRPError.invalidServerPublicKey
        }

        let u = computeU(A, B)
        guard u != 0 else {
            throw SRPError.zeroScramblingParameter
        }

        let x = computeX(email: email, password: password, salt: salt)
        let k = computeK()

        // S = (B - k * g^x) ^ (a + u*x) mod N
        let gx = g.power(x, modulus: N)
        let kgx = (k * gx) % N
        // Ensure non-negative
        let base = ((B + N) - (kgx % N)) % N
        let exp = a + u * x
        let S = base.power(exp, modulus: N)

        let sBytes = bigUIntToData(S, length: nByteLength)
        let sessionKey = hashSHA256(sBytes)

        // M1 = H(A || B || K)
        let aBytes = bigUIntToData(A, length: nByteLength)
        let bBytes = bigUIntToData(B, length: nByteLength)
        let clientProof = hashSHA256(aBytes, bBytes, sessionKey)

        return (clientProof: clientProof, sessionKey: sessionKey)
    }
}

// MARK: - Errors

public enum SRPError: Error, Sendable {
    case invalidServerPublicKey   // B mod N == 0
    case zeroScramblingParameter  // u == 0
}
