//
//  AuditLogTests.swift
//  P4 — the tamper-evident audit chain (原语 Fact). Appends link via SHA-256;
//  any post-hoc alteration must break verify().
//

import XCTest
@testable import AuthBoxMac

@MainActor
final class AuditLogTests: XCTestCase {

    private func intent(_ id: String) -> AccessIntent {
        AccessIntent(agentId: id, action: .read, itemType: "login", itemId: "GitHub")
    }
    private func effect(_ allowed: Bool) -> AccessEffect {
        AccessEffect(allowed: allowed, reason: allowed ? "ok" : "denied", appliedPolicies: ["p"])
    }

    func test_append_links_to_genesis_then_previous() {
        let log = AuditLog(now: { Date(timeIntervalSince1970: 100) })
        let a = log.append(intent: intent("agent-1"), effect: effect(true))
        let b = log.append(intent: intent("agent-2"), effect: effect(false))

        XCTAssertEqual(a.seq, 0)
        XCTAssertEqual(a.prevHash, AuditLog.genesisHash)
        XCTAssertEqual(b.seq, 1)
        XCTAssertEqual(b.prevHash, a.hash, "each entry seals the previous one")
        XCTAssertEqual(a.hash.count, 64)
    }

    func test_verify_passes_for_intact_chain() {
        let log = AuditLog(now: { Date(timeIntervalSince1970: 100) })
        for i in 0..<5 { log.append(intent: intent("agent-\(i)"), effect: effect(i.isMultiple(of: 2))) }
        XCTAssertTrue(log.verify())
        XCTAssertEqual(log.facts.count, 5)
    }

    func test_deterministic_hash_for_same_content() {
        let make = { () -> AuditFact in
            let log = AuditLog(now: { Date(timeIntervalSince1970: 42) })
            return log.append(intent: self.intent("agent-x"), effect: self.effect(true))
        }
        XCTAssertEqual(make().hash, make().hash, "same content + same clock → same hash")
    }

    func test_distinct_decisions_produce_distinct_hashes() {
        let log = AuditLog(now: { Date(timeIntervalSince1970: 100) })
        let a = log.append(intent: intent("agent-1"), effect: effect(true))
        let b = log.append(intent: intent("agent-1"), effect: effect(false))
        XCTAssertNotEqual(a.hash, b.hash)
    }
}
