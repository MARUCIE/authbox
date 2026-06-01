//
//  AuditLog.swift
//  P4 — tamper-evident audit log (原语 5: Fact). Each access decision is sealed
//  into a hash chain: every entry's hash covers its own fields PLUS the previous
//  entry's hash. Altering any past entry breaks every subsequent link, which
//  verify() detects. This is the immutable record of what the broker authorized.
//

import Foundation
import CryptoKit

struct AuditFact: Identifiable, Codable, Equatable {
    let seq: Int
    let timestamp: Date
    let agentId: String
    let action: String
    let itemId: String?
    let allowed: Bool
    let reason: String
    let prevHash: String
    let hash: String

    var id: Int { seq }
}

@MainActor
final class AuditLog {
    static let genesisHash = String(repeating: "0", count: 64)

    private(set) var facts: [AuditFact] = []
    private let now: () -> Date

    init(now: @escaping () -> Date = Date.init) { self.now = now }

    /// Canonical, order-stable serialization of an entry's content for hashing.
    private static func canonical(seq: Int, timestamp: Date, agentId: String,
                                  action: String, itemId: String?, allowed: Bool,
                                  reason: String, prevHash: String) -> String {
        // ISO-like fixed encoding of the instant (seconds since 1970, 3 dp) keeps
        // the hash reproducible across re-verification without locale drift.
        let ts = String(format: "%.3f", timestamp.timeIntervalSince1970)
        return [String(seq), ts, agentId, action, itemId ?? "", String(allowed), reason, prevHash]
            .joined(separator: "\u{1f}")   // unit separator — unambiguous field boundary
    }

    private static func sha256Hex(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Seal one decision into the chain and return the new Fact.
    @discardableResult
    func append(intent: AccessIntent, effect: AccessEffect) -> AuditFact {
        let seq = facts.count
        let prev = facts.last?.hash ?? AuditLog.genesisHash
        let ts = now()
        let canonical = AuditLog.canonical(
            seq: seq, timestamp: ts, agentId: intent.agentId, action: intent.action.rawValue,
            itemId: intent.itemId, allowed: effect.allowed, reason: effect.reason, prevHash: prev)
        let fact = AuditFact(
            seq: seq, timestamp: ts, agentId: intent.agentId, action: intent.action.rawValue,
            itemId: intent.itemId, allowed: effect.allowed, reason: effect.reason,
            prevHash: prev, hash: AuditLog.sha256Hex(canonical))
        facts.append(fact)
        return fact
    }

    /// Recompute the chain. Returns true iff every entry's hash and prevHash link
    /// are intact (no entry was altered, reordered, inserted, or removed).
    func verify() -> Bool {
        var expectedPrev = AuditLog.genesisHash
        for (i, f) in facts.enumerated() {
            guard f.seq == i, f.prevHash == expectedPrev else { return false }
            let recomputed = AuditLog.sha256Hex(AuditLog.canonical(
                seq: f.seq, timestamp: f.timestamp, agentId: f.agentId, action: f.action,
                itemId: f.itemId, allowed: f.allowed, reason: f.reason, prevHash: f.prevHash))
            if recomputed != f.hash { return false }
            expectedPrev = f.hash
        }
        return true
    }
}
