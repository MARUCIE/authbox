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
}
