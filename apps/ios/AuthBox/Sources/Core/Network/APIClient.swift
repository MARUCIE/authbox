import Foundation
import AuthBoxCrypto

/// HTTP client for the Auth Box Go API.
/// Handles SRP-6a authentication, session management, and vault sync.
///
/// API base: configurable (default http://localhost:4010/api/v1)
/// All data is base64-encoded for wire transfer.
actor APIClient {

    private let baseURL: URL
    private let session: URLSession
    private var sessionToken: String?

    init(baseURL: String = APIConfig.baseURL) {
        self.baseURL = URL(string: baseURL)!
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // MARK: - Auth: Register

    struct RegisterRequest: Codable {
        let email: String
        let srpSalt: String
        let srpVerifier: String
        let encryptedVaultKey: String
        let vaultKeyNonce: String
        let vaultKeyTag: String
        let kdfParams: KDFParams
    }

    struct RegisterResponse: Codable {
        let userId: String
    }

    func register(
        email: String,
        password: String,
        vaultKey: Data,
        encKey: Data
    ) async throws -> RegisterResponse {
        let salt = AES256GCM.generateRandomBytes(32)

        // SRP verifier
        let (_, verifier) = SRP.generateVerifier(email: email, password: password, salt: salt)

        // Encrypt vault key with encKey
        let bundle = try VaultCrypto.encryptVaultKey(encKey: encKey, vaultKey: vaultKey)

        let req = RegisterRequest(
            email: email,
            srpSalt: salt.base64EncodedString(),
            srpVerifier: verifier.base64EncodedString(),
            encryptedVaultKey: bundle.encryptedVaultKey.base64EncodedString(),
            vaultKeyNonce: bundle.nonce.base64EncodedString(),
            vaultKeyTag: bundle.tag.base64EncodedString(),
            kdfParams: KDFParams(
                algorithm: "argon2id",
                memory: Int(Argon2Config.memoryKiB),
                iterations: Int(Argon2Config.iterations),
                parallelism: Int(Argon2Config.parallelism),
                keyLength: Argon2Config.hashLength
            )
        )

        return try await post("/auth/register", body: req)
    }

    // MARK: - Auth: Login (SRP-6a two-step)

    struct LoginInitRequest: Codable {
        let email: String
        let clientPublicA: String
    }

    struct LoginInitResponse: Codable {
        let srpSalt: String
        let serverPublicB: String
    }

    struct LoginVerifyRequest: Codable {
        let email: String
        let clientPublicA: String
        let clientProofM1: String
    }

    struct LoginVerifyResponse: Codable {
        let sessionToken: String?
        let serverProofM2: String
        let encryptedVaultKey: String?
        let vaultKeyNonce: String?
        let vaultKeyTag: String?
        let kdfParams: KDFParams?
        let totpRequired: Bool?
    }

    /// Full SRP-6a login: init → verify → session token + encrypted vault key.
    func login(email: String, password: String) async throws -> (sessionToken: String, vaultKeyBundle: VaultKeyBundle) {
        // Step 1: Client init
        let srpState = SRP.clientInit()
        let initReq = LoginInitRequest(
            email: email,
            clientPublicA: srpState.ephemeralPublic.base64EncodedString()
        )
        let initResp: LoginInitResponse = try await post("/auth/login/init", body: initReq)

        // Step 2: Client verify
        guard let salt = Data(base64Encoded: initResp.srpSalt),
              let serverB = Data(base64Encoded: initResp.serverPublicB) else {
            throw APIError.invalidResponse
        }
        let (clientProof, sessionKey) = try SRP.clientVerify(
            state: srpState,
            email: email,
            password: password,
            salt: salt,
            serverPublicB: serverB
        )

        let verifyReq = LoginVerifyRequest(
            email: email,
            clientPublicA: srpState.ephemeralPublic.base64EncodedString(),
            clientProofM1: clientProof.base64EncodedString()
        )
        let verifyResp: LoginVerifyResponse = try await post("/auth/login/verify", body: verifyReq)

        guard let serverProof = Data(base64Encoded: verifyResp.serverProofM2),
              SRP.verifyServerProof(
                state: srpState,
                clientProof: clientProof,
                sessionKey: sessionKey,
                serverProof: serverProof
              ) else {
            throw APIError.invalidServerProof
        }

        guard let token = verifyResp.sessionToken,
              let encVaultKey = verifyResp.encryptedVaultKey,
              let nonce = verifyResp.vaultKeyNonce,
              let tag = verifyResp.vaultKeyTag else {
            if verifyResp.totpRequired == true {
                throw APIError.totpRequired
            }
            throw APIError.loginFailed
        }

        self.sessionToken = token

        guard let encVaultKeyData = Data(base64Encoded: encVaultKey),
              let nonceData = Data(base64Encoded: nonce),
              let tagData = Data(base64Encoded: tag) else {
            throw APIError.invalidResponse
        }
        let bundle = VaultKeyBundle(
            encryptedVaultKey: encVaultKeyData,
            nonce: nonceData,
            tag: tagData
        )

        return (token, bundle)
    }

    // MARK: - Vault Sync

    struct VaultItemResponse: Codable {
        let id: String
        let encryptedData: String
        let nonce: String
        let tag: String
        let version: Int
        let syncSeq: Int64?
        let itemType: String?
        let createdAt: String
        let updatedAt: String
    }

    // Mirrors the Go handler exactly: cursor param `after`, response
    // {items, syncToken, hasMore}. (The old sinceVersion/currentVersion shape
    // never matched the server and would have failed decoding on first use.)
    struct SyncPullResponse: Codable {
        let items: [VaultItemResponse]?
        let syncToken: String
        let hasMore: Bool
    }

    func syncPull(after: String? = nil) async throws -> SyncPullResponse {
        var path = "/vault/sync"
        if let after, !after.isEmpty {
            path += "?after=\(after)"
        }
        return try await get(path)
    }

    struct SyncPushRequest: Codable {
        let items: [SyncPushItem]
    }

    struct SyncPushItem: Codable {
        let id: String?
        let encryptedData: String
        let nonce: String
        let tag: String
        let itemType: String
        let deleted: Bool?
    }

    func syncPush(items: [SyncPushItem]) async throws {
        let _: EmptyResponse = try await post("/vault/sync", body: SyncPushRequest(items: items))
    }

    // MARK: - Logout

    func logout() async throws {
        let _: EmptyResponse = try await post("/auth/logout", body: EmptyBody())
        sessionToken = nil
    }

    // MARK: - HTTP Helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = sessionToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        if let token = sessionToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.httpError(statusCode: http.statusCode, body: body)
        }
    }
}

// MARK: - Supporting Types

struct KDFParams: Codable, Sendable {
    let algorithm: String
    let memory: Int
    let iterations: Int
    let parallelism: Int
    let keyLength: Int
}

private struct EmptyBody: Codable {}
private struct EmptyResponse: Codable {}

enum APIError: LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int, body: String)
    case loginFailed
    case invalidServerProof
    case totpRequired

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "Invalid server response"
        case .httpError(let code, let body): "HTTP \(code): \(body)"
        case .loginFailed: "Login failed"
        case .invalidServerProof: "SRP server proof verification failed"
        case .totpRequired: "TOTP verification required"
        }
    }
}
