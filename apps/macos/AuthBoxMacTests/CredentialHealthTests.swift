//
//  CredentialHealthTests.swift
//  P3 — status-mapping tests for the health-check executor. A fake transport
//  returns canned (status, body) so we test the parse logic without real network.
//

import XCTest
@testable import AuthBoxMac

private struct FakeTransport: HealthTransport {
    let status: Int
    let body: String
    func send(_ request: HealthRequest) async throws -> (status: Int, body: String) {
        (status, body)
    }
}

private struct ThrowingTransport: HealthTransport {
    func send(_ request: HealthRequest) async throws -> (status: Int, body: String) {
        throw URLError(.notConnectedToInternet)
    }
}

final class CredentialHealthTests: XCTestCase {

    private let fixedNow = { Date(timeIntervalSince1970: 0) }

    func test_openai_status_mapping() async {
        async let ok = CredentialHealth.check(providerId: "openai", fields: ["api_key": "sk"],
                                              transport: FakeTransport(status: 200, body: ""), now: fixedNow)
        async let bad = CredentialHealth.check(providerId: "openai", fields: ["api_key": "sk"],
                                               transport: FakeTransport(status: 401, body: ""), now: fixedNow)
        async let limited = CredentialHealth.check(providerId: "openai", fields: ["api_key": "sk"],
                                                   transport: FakeTransport(status: 429, body: ""), now: fixedNow)
        let (a, b, c) = await (ok, bad, limited)
        XCTAssertEqual(a.status, .valid)
        XCTAssertEqual(b.status, .invalid)
        XCTAssertEqual(c.status, .quota_exceeded)
    }

    func test_anthropic_400_is_valid() async {
        let r = await CredentialHealth.check(providerId: "anthropic", fields: ["api_key": "sk"],
                                             transport: FakeTransport(status: 400, body: ""), now: fixedNow)
        XCTAssertEqual(r.status, .valid, "400 means key authenticated but model access varies")
    }

    func test_github_parses_login_from_body() async {
        let r = await CredentialHealth.check(providerId: "github",
                                             fields: ["personal_access_token": "ghp"],
                                             transport: FakeTransport(status: 200, body: #"{"login":"marucie"}"#),
                                             now: fixedNow)
        XCTAssertEqual(r.status, .valid)
        XCTAssertEqual(r.message, "Valid. User: marucie")
    }

    func test_unknown_provider_is_unchecked() async {
        let r = await CredentialHealth.check(providerId: "no_such_provider", fields: [:],
                                             transport: FakeTransport(status: 200, body: ""), now: fixedNow)
        XCTAssertEqual(r.status, .unchecked)
    }

    func test_transport_error_maps_to_error_status() async {
        let r = await CredentialHealth.check(providerId: "openai", fields: ["api_key": "sk"],
                                             transport: ThrowingTransport(), now: fixedNow)
        XCTAssertEqual(r.status, .error)
    }

    func test_batch_returns_one_result_per_credential() async {
        let creds = (0..<7).map { (providerId: $0 % 2 == 0 ? "openai" : "groq", fields: ["api_key": "sk"]) }
        let results = await CredentialHealth.batch(creds, transport: FakeTransport(status: 200, body: ""))
        XCTAssertEqual(results.count, 7)
        XCTAssertTrue(results.allSatisfy { $0.status == .valid })
    }

    func test_registry_covers_expected_providers() {
        XCTAssertTrue(CredentialHealth.hasHealthCheck("openai"))
        XCTAssertTrue(CredentialHealth.hasHealthCheck("github"))
        XCTAssertFalse(CredentialHealth.hasHealthCheck("kling"))
    }

    // MARK: - SEC-004 SSRF guard

    func test_attacker_base_url_to_metadata_is_blocked() async {
        // A malicious .env points openai's base_url at the cloud metadata service.
        // The probe must be blocked BEFORE the credential leaves the machine,
        // even though the (fake) transport would have returned 200.
        let r = await CredentialHealth.check(
            providerId: "openai",
            fields: ["base_url": "http://169.254.169.254/latest/meta-data", "api_key": "sk-secret"],
            transport: FakeTransport(status: 200, body: ""), now: fixedNow)
        XCTAssertEqual(r.status, .error)
        XCTAssertTrue(r.message.contains("blocked"), "unsafe endpoint must be refused")
    }

    func test_safe_endpoint_classifier() {
        XCTAssertTrue(CredentialHealth.isSafeEndpoint("https://api.openai.com/v1/models"))
        XCTAssertTrue(CredentialHealth.isSafeEndpoint("https://eu.posthog.com/api/projects/"))
        XCTAssertFalse(CredentialHealth.isSafeEndpoint("http://api.openai.com/v1/models"), "non-HTTPS rejected")
        XCTAssertFalse(CredentialHealth.isSafeEndpoint("https://169.254.169.254/"), "metadata IP rejected")
        XCTAssertFalse(CredentialHealth.isSafeEndpoint("https://127.0.0.1/v1"), "loopback rejected")
        XCTAssertFalse(CredentialHealth.isSafeEndpoint("https://10.0.0.5/v1"), "private-A rejected")
        XCTAssertFalse(CredentialHealth.isSafeEndpoint("https://192.168.1.1/v1"), "private-C rejected")
        XCTAssertFalse(CredentialHealth.isSafeEndpoint("https://internal.host.local/x"), ".local rejected")
    }

    // MARK: - AUD-SSRF-01/02 — allowlist defeats the whole bypass class

    func test_allowlist_blocks_attacker_host_and_every_ip_encoding() {
        // AUD-SSRF-01: an arbitrary attacker host must NOT pass just because it is
        // public + HTTPS. AUD-SSRF-02: no IP-literal encoding may reach loopback or
        // the cloud metadata service. A positive allowlist refuses all of these at
        // once — none is a provider hostname.
        let mustBlock = [
            "https://evil.attacker.com/v1/models",          // AUD-SSRF-01 — public attacker host
            "https://api.openai.com.attacker.com/v1/models", // suffix-confusion lookalike
            "https://2130706433/v1",                         // 127.0.0.1 as decimal int
            "https://0x7f000001/v1",                         // 127.0.0.1 as hex
            "https://0177.0.0.1/v1",                         // 127.0.0.1 with octal octet
            "https://2852039166/latest/meta-data",           // 169.254.169.254 as decimal int
            "https://[::ffff:127.0.0.1]/v1",                 // IPv4-mapped IPv6 loopback
            "https://[0:0:0:0:0:0:0:1]/v1",                  // fully-expanded IPv6 loopback
            "https://[::1]/v1",                              // IPv6 loopback
            "https://metadata.google.internal/computeMetadata/v1/", // GCP metadata name
        ]
        for u in mustBlock {
            XCTAssertFalse(CredentialHealth.isSafeEndpoint(u), "must block: \(u)")
        }

        let mustAllow = [
            "https://api.openai.com/v1/models",
            "https://app.posthog.com/api/projects/",
            "https://eu.posthog.com/api/projects/",
            "https://api.anthropic.com/v1/messages",
            "https://api.github.com/user",
        ]
        for u in mustAllow {
            XCTAssertTrue(CredentialHealth.isSafeEndpoint(u), "must allow: \(u)")
        }
    }

    func test_allowlist_is_case_and_trailing_dot_normalized() {
        XCTAssertTrue(CredentialHealth.isSafeEndpoint("https://API.OpenAI.COM/v1/models"), "case-folded host allowed")
        XCTAssertTrue(CredentialHealth.isSafeEndpoint("https://api.openai.com./v1/models"), "FQDN trailing dot allowed")
    }

    func test_executor_blocks_attacker_base_url_before_sending_key() async {
        // AUD-SSRF-01 end-to-end: a crafted .env points openai's base_url at an
        // attacker host over HTTPS. Even though the (fake) transport would 200, the
        // guard must refuse before the bearer key is sent.
        let r = await CredentialHealth.check(
            providerId: "openai",
            fields: ["base_url": "https://evil.attacker.com/v1", "api_key": "sk-secret"],
            transport: FakeTransport(status: 200, body: ""), now: fixedNow)
        XCTAssertEqual(r.status, .error)
        XCTAssertTrue(r.message.contains("blocked"), "attacker base_url must be refused")
    }
}
