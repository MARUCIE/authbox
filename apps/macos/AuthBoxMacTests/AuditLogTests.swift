//
//  AuditLogTests.swift
//  P4 — the tamper-evident audit chain (原语 Fact). Appends link via SHA-256;
//  any post-hoc alteration must break verify().
//

import XCTest
@testable import AuthBoxMac

/// In-memory stand-in for the Keychain head anchor. Shared across the "write" and
/// "reload" AuditLog instances in a test, exactly as the real Keychain persists
/// across app launches — and, crucially, keeping tests off the real login Keychain.
private final class InMemoryAnchor: AuditHeadAnchorStore, @unchecked Sendable {
    private var head: AuditHead?
    func load() -> AuditHead? { head }
    func save(_ h: AuditHead) { head = h }
    func clear() { head = nil }
}

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

    // MARK: - SEC-002 persistence (chain survives restart; tamper is detected)

    private func tempURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("audit-test-\(UUID().uuidString).jsonl")
    }

    func test_chain_persists_and_reloads_across_restart() {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url) }

        let anchor = InMemoryAnchor()   // shared = same Keychain across "restart"
        let first = AuditLog(url: url, anchor: anchor, now: { Date(timeIntervalSince1970: 100) })
        first.append(intent: intent("agent-1"), effect: effect(true))
        first.append(intent: intent("agent-2"), effect: effect(false))

        // A fresh instance (simulating an app restart) must reload the chain.
        let reloaded = AuditLog(url: url, anchor: anchor)
        XCTAssertEqual(reloaded.facts.count, 2, "prior chain reloaded from disk")
        XCTAssertTrue(reloaded.loadedIntegrityOK, "reloaded chain verifies intact")
        XCTAssertTrue(reloaded.verify())

        // Appending continues the chain from the loaded tip.
        let cont = reloaded.append(intent: intent("agent-3"), effect: effect(true))
        XCTAssertEqual(cont.seq, 2)
        XCTAssertTrue(reloaded.verify())
    }

    func test_tampered_persisted_chain_fails_integrity_on_load() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url) }

        let anchor = InMemoryAnchor()
        let log = AuditLog(url: url, anchor: anchor, now: { Date(timeIntervalSince1970: 100) })
        log.append(intent: intent("agent-1"), effect: effect(true))
        log.append(intent: intent("agent-2"), effect: effect(true))

        // Tamper: flip an allowed=true decision to false in the persisted file.
        let raw = try String(contentsOf: url, encoding: .utf8)
        let tampered = raw.replacingOccurrences(of: "\"reason\":\"ok\"", with: "\"reason\":\"FORGED\"")
        XCTAssertNotEqual(raw, tampered, "precondition: the tamper actually changed a line")
        try tampered.write(to: url, atomically: true, encoding: .utf8)

        let reloaded = AuditLog(url: url, anchor: anchor)
        XCTAssertFalse(reloaded.loadedIntegrityOK, "edited Fact breaks the hash chain")
        XCTAssertFalse(reloaded.verify())
    }

    // MARK: - BROKER-AUDIT-01 (out-of-file head anchor catches a dropped tail)

    /// Seal `n` facts into a persisted log sharing `anchor`, then drop the instance.
    private func seed(_ n: Int, url: URL, anchor: InMemoryAnchor) {
        let log = AuditLog(url: url, anchor: anchor, now: { Date(timeIntervalSince1970: 100) })
        for i in 0..<n { log.append(intent: intent("agent-\(i)"), effect: effect(true)) }
    }

    func test_suffix_truncation_is_detected() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url) }
        let anchor = InMemoryAnchor()
        seed(3, url: url, anchor: anchor)                 // anchor head = (3, hash#2)

        var lines = try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n").map(String.init)
        XCTAssertEqual(lines.count, 3)
        lines.removeLast()                               // drop the tail entry
        try (lines.joined(separator: "\n") + "\n").write(to: url, atomically: true, encoding: .utf8)

        let reloaded = AuditLog(url: url, anchor: anchor)
        XCTAssertEqual(reloaded.facts.count, 2)
        XCTAssertTrue(reloaded.verify(), "a valid prefix is internally consistent — the chain alone is fooled")
        XCTAssertFalse(reloaded.loadedIntegrityOK, "the head anchor (count 3 ≠ 2) catches the dropped tail")
    }

    func test_full_deletion_is_detected() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url) }
        let anchor = InMemoryAnchor()
        seed(2, url: url, anchor: anchor)
        try "".write(to: url, atomically: true, encoding: .utf8)   // erase the whole record

        let reloaded = AuditLog(url: url, anchor: anchor)
        XCTAssertEqual(reloaded.facts.count, 0)
        XCTAssertTrue(reloaded.verify(), "an empty chain trivially 're-verifies'")
        XCTAssertFalse(reloaded.loadedIntegrityOK, "the anchor (count 2 ≠ 0) catches the deletion")
    }

    func test_trust_on_first_use_adopts_head_when_no_anchor() throws {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url) }
        // Seed the FILE without populating the shared anchor (pre-anchor upgrade path).
        seed(2, url: url, anchor: InMemoryAnchor())      // throwaway anchor
        let anchor = InMemoryAnchor()
        XCTAssertNil(anchor.load(), "precondition: shared anchor empty")

        let reloaded = AuditLog(url: url, anchor: anchor)
        XCTAssertTrue(reloaded.loadedIntegrityOK, "TOFU: a verified chain with no anchor is trusted")
        XCTAssertEqual(anchor.load()?.count, 2, "and the anchor is now established from the verified head")
    }

    func test_anchor_advances_on_each_append() {
        let url = tempURL()
        defer { try? FileManager.default.removeItem(at: url) }
        let anchor = InMemoryAnchor()
        let log = AuditLog(url: url, anchor: anchor, now: { Date(timeIntervalSince1970: 100) })
        log.append(intent: intent("a"), effect: effect(true))
        XCTAssertEqual(anchor.load()?.count, 1)
        log.append(intent: intent("b"), effect: effect(true))
        XCTAssertEqual(anchor.load()?.count, 2)
        XCTAssertEqual(anchor.load()?.headHash, log.facts.last?.hash, "anchor tracks the latest hash")
    }
}
