//
//  CredentialHealth.swift
//  P3 — Swift port of apps/web/lib/credential-health.ts. Verifies a key is live
//  by pinging the provider's own lightweight endpoint with the user's own key.
//
//  Network egress is real but minimal and user-initiated: the request goes only
//  to the provider's API, carrying only that provider's credential. The transport
//  is injectable so status-mapping logic is testable without real network.
//

import Foundation

enum HealthStatus: String, Equatable {
    case valid, invalid, expired, quota_exceeded, error, unchecked
}

struct HealthCheckResult: Equatable {
    let providerId: String
    let status: HealthStatus
    let message: String
    let latencyMs: Int
}

/// One outbound probe request, fully resolved from decrypted fields.
struct HealthRequest {
    let url: String
    let method: String
    let headers: [String: String]
    let body: String?
}

/// Seam for the actual HTTP call. The default is URLSession; tests inject a fake.
protocol HealthTransport: Sendable {
    func send(_ request: HealthRequest) async throws -> (status: Int, body: String)
}

struct URLSessionHealthTransport: HealthTransport {
    func send(_ request: HealthRequest) async throws -> (status: Int, body: String) {
        guard let url = URL(string: request.url) else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = request.method
        for (k, v) in request.headers { req.setValue(v, forHTTPHeaderField: k) }
        if request.method == "POST" { req.httpBody = request.body?.data(using: .utf8) }
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        return (code, String(data: data, encoding: .utf8) ?? "")
    }
}

/// A provider's probe definition: how to build the request and read the result.
struct ProviderHealthCheck {
    let url: ([String: String]) -> String
    let method: String
    let headers: ([String: String]) -> [String: String]
    let body: ([String: String]) -> String?
    let parse: (_ status: Int, _ body: String) -> (status: HealthStatus, message: String)
}

enum CredentialHealth {

    // MARK: - Common parse builders

    /// 200 → valid, 401 → invalid, 429 → quota, else error.
    private static func standardParse(_ status: Int, _ body: String) -> (status: HealthStatus, message: String) {
        switch status {
        case 200: return (.valid, "API key valid")
        case 401: return (.invalid, "Invalid API key")
        case 429: return (.quota_exceeded, "Rate limited or quota exceeded")
        default:  return (.error, "HTTP \(status)")
        }
    }

    /// GET with `Authorization: Bearer <field>` and the standard parse.
    private static func bearer(_ url: String, field: String = "api_key") -> ProviderHealthCheck {
        ProviderHealthCheck(
            url: { _ in url },
            method: "GET",
            headers: { f in ["Authorization": "Bearer \(f[field] ?? "")"] },
            body: { _ in nil },
            parse: standardParse
        )
    }

    // MARK: - Registry (mirrors HEALTH_CHECKS in credential-health.ts)

    static let checks: [String: ProviderHealthCheck] = {
        var m: [String: ProviderHealthCheck] = [:]

        m["openai"] = ProviderHealthCheck(
            url: { f in "\(f["base_url"] ?? "https://api.openai.com/v1")/models" },
            method: "GET",
            headers: { f in ["Authorization": "Bearer \(f["api_key"] ?? "")"] },
            body: { _ in nil },
            parse: standardParse
        )

        m["anthropic"] = ProviderHealthCheck(
            url: { _ in "https://api.anthropic.com/v1/messages" },
            method: "POST",
            headers: { f in [
                "x-api-key": f["api_key"] ?? "",
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            ] },
            body: { _ in #"{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"ping"}]}"# },
            parse: { status, _ in
                switch status {
                case 200: return (.valid, "API key valid")
                case 401: return (.invalid, "Invalid API key")
                case 429: return (.quota_exceeded, "Rate limited")
                case 400: return (.valid, "API key valid (model access varies)")
                default:  return (.error, "HTTP \(status)")
                }
            }
        )

        m["google_ai"] = ProviderHealthCheck(
            url: { _ in "https://generativelanguage.googleapis.com/v1beta/models" },
            method: "GET",
            headers: { f in ["x-goog-api-key": f["api_key"] ?? ""] },
            body: { _ in nil },
            parse: { status, _ in
                switch status {
                case 200: return (.valid, "API key valid")
                case 400, 403: return (.invalid, "Invalid API key")
                default: return (.error, "HTTP \(status)")
                }
            }
        )

        m["groq"] = bearer("https://api.groq.com/openai/v1/models")
        m["deepseek"] = bearer("https://api.deepseek.com/v1/models")
        m["mistral"] = bearer("https://api.mistral.ai/v1/models")
        m["together"] = bearer("https://api.together.xyz/v1/models")
        m["openrouter"] = bearer("https://openrouter.ai/api/v1/models")
        m["sendgrid"] = bearer("https://api.sendgrid.com/v3/user/profile")
        m["resend"] = bearer("https://api.resend.com/api-keys")

        m["replicate"] = ProviderHealthCheck(
            url: { _ in "https://api.replicate.com/v1/account" },
            method: "GET",
            headers: { f in ["Authorization": "Bearer \(f["api_token"] ?? f["api_key"] ?? "")"] },
            body: { _ in nil },
            parse: { status, _ in
                switch status {
                case 200: return (.valid, "API token valid")
                case 401: return (.invalid, "Invalid token")
                default: return (.error, "HTTP \(status)")
                }
            }
        )

        m["elevenlabs"] = ProviderHealthCheck(
            url: { _ in "https://api.elevenlabs.io/v1/user" },
            method: "GET",
            headers: { f in ["xi-api-key": f["api_key"] ?? ""] },
            body: { _ in nil },
            parse: standardParse
        )

        m["heygen"] = ProviderHealthCheck(
            url: { _ in "https://api.heygen.com/v2/user/remaining_quota" },
            method: "GET",
            headers: { f in ["x-api-key": f["api_key"] ?? ""] },
            body: { _ in nil },
            parse: { status, body in
                if status == 200 {
                    if let data = body.data(using: .utf8),
                       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let inner = obj["data"] as? [String: Any],
                       let quota = inner["remaining_quota"] {
                        return (.valid, "Valid. Remaining quota: \(quota)")
                    }
                    return (.valid, "API key valid")
                }
                if status == 401 { return (.invalid, "Invalid API key") }
                return (.error, "HTTP \(status)")
            }
        )

        m["pinecone"] = ProviderHealthCheck(
            url: { _ in "https://api.pinecone.io/indexes" },
            method: "GET",
            headers: { f in ["Api-Key": f["api_key"] ?? ""] },
            body: { _ in nil },
            parse: { status, _ in
                switch status {
                case 200: return (.valid, "API key valid")
                case 401, 403: return (.invalid, "Invalid API key")
                default: return (.error, "HTTP \(status)")
                }
            }
        )

        m["brave_search"] = ProviderHealthCheck(
            url: { _ in "https://api.search.brave.com/res/v1/web/search?q=test&count=1" },
            method: "GET",
            headers: { f in ["X-Subscription-Token": f["api_key"] ?? ""] },
            body: { _ in nil },
            parse: { status, _ in
                switch status {
                case 200: return (.valid, "API key valid")
                case 401, 403: return (.invalid, "Invalid API key")
                case 429: return (.quota_exceeded, "Rate limited")
                default: return (.error, "HTTP \(status)")
                }
            }
        )

        m["tavily"] = ProviderHealthCheck(
            url: { _ in "https://api.tavily.com/search" },
            method: "POST",
            headers: { _ in ["Content-Type": "application/json"] },
            body: { f in
                let key = (f["api_key"] ?? "").replacingOccurrences(of: "\"", with: "\\\"")
                return "{\"api_key\":\"\(key)\",\"query\":\"test\",\"max_results\":1}"
            },
            parse: { status, _ in
                switch status {
                case 200: return (.valid, "API key valid")
                case 401, 403: return (.invalid, "Invalid API key")
                default: return (.error, "HTTP \(status)")
                }
            }
        )

        m["cloudflare"] = ProviderHealthCheck(
            url: { _ in "https://api.cloudflare.com/client/v4/user/tokens/verify" },
            method: "GET",
            headers: { f in ["Authorization": "Bearer \(f["api_token"] ?? "")"] },
            body: { _ in nil },
            parse: { status, _ in
                switch status {
                case 200: return (.valid, "Token valid")
                case 401: return (.invalid, "Invalid token")
                default: return (.error, "HTTP \(status)")
                }
            }
        )

        m["vercel"] = ProviderHealthCheck(
            url: { _ in "https://api.vercel.com/v2/user" },
            method: "GET",
            headers: { f in ["Authorization": "Bearer \(f["api_token"] ?? "")"] },
            body: { _ in nil },
            parse: { status, _ in
                switch status {
                case 200: return (.valid, "Token valid")
                case 401, 403: return (.invalid, "Invalid token")
                default: return (.error, "HTTP \(status)")
                }
            }
        )

        m["github"] = ProviderHealthCheck(
            url: { _ in "https://api.github.com/user" },
            method: "GET",
            headers: { f in [
                "Authorization": "Bearer \(f["personal_access_token"] ?? "")",
                "User-Agent": "AuthBox/2.0",
            ] },
            body: { _ in nil },
            parse: { status, body in
                if status == 200 {
                    if let data = body.data(using: .utf8),
                       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let login = obj["login"] as? String {
                        return (.valid, "Valid. User: \(login)")
                    }
                    return (.valid, "Token valid")
                }
                if status == 401 { return (.invalid, "Invalid token") }
                return (.error, "HTTP \(status)")
            }
        )

        m["posthog"] = ProviderHealthCheck(
            url: { f in "\(f["host"] ?? "https://app.posthog.com")/api/projects/" },
            method: "GET",
            headers: { f in ["Authorization": "Bearer \(f["api_key"] ?? "")"] },
            body: { _ in nil },
            parse: standardParse
        )

        return m
    }()

    static func hasHealthCheck(_ providerId: String) -> Bool { checks[providerId] != nil }
    static var providers: [String] { Array(checks.keys).sorted() }

    // MARK: - Executor

    /// Run one health check. `now` is injectable for deterministic latency in tests.
    static func check(
        providerId: String,
        fields: [String: String],
        transport: HealthTransport = URLSessionHealthTransport(),
        now: () -> Date = Date.init
    ) async -> HealthCheckResult {
        let start = now()
        guard let def = checks[providerId] else {
            return HealthCheckResult(providerId: providerId, status: .unchecked,
                                     message: "No health check available for this provider", latencyMs: 0)
        }
        let request = HealthRequest(url: def.url(fields), method: def.method,
                                    headers: def.headers(fields), body: def.body(fields))
        do {
            let (status, body) = try await transport.send(request)
            let parsed = def.parse(status, body)
            return HealthCheckResult(providerId: providerId, status: parsed.status,
                                     message: parsed.message,
                                     latencyMs: Int(now().timeIntervalSince(start) * 1000))
        } catch {
            return HealthCheckResult(providerId: providerId, status: .error,
                                     message: error.localizedDescription,
                                     latencyMs: Int(now().timeIntervalSince(start) * 1000))
        }
    }

    /// Batch with bounded concurrency (5), mirroring the TS executor.
    static func batch(
        _ creds: [(providerId: String, fields: [String: String])],
        transport: HealthTransport = URLSessionHealthTransport()
    ) async -> [HealthCheckResult] {
        var results: [HealthCheckResult] = []
        var index = 0
        while index < creds.count {
            let slice = creds[index..<min(index + 5, creds.count)]
            let batch = await withTaskGroup(of: HealthCheckResult.self) { group -> [HealthCheckResult] in
                for c in slice {
                    group.addTask { await check(providerId: c.providerId, fields: c.fields, transport: transport) }
                }
                var acc: [HealthCheckResult] = []
                for await r in group { acc.append(r) }
                return acc
            }
            results.append(contentsOf: batch)
            index += 5
        }
        return results
    }
}
