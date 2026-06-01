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

/// Append-only JSONL persistence for the audit chain (SEC-002). One Fact per
/// line. Loading reconstructs the in-memory chain on launch so a restart no
/// longer wipes the tamper-evidence; appending seals each new Fact to disk
/// immediately. The file itself is plaintext — its integrity guarantee comes
/// from the hash chain, not file permissions: any edit/truncation/reorder is
/// caught by verify().
struct AuditFileStore {
    let url: URL

    func load() -> [AuditFact] {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return [] }
        let decoder = JSONDecoder()
        return text.split(separator: "\n").compactMap {
            try? decoder.decode(AuditFact.self, from: Data($0.utf8))
        }
    }

    func append(_ fact: AuditFact) {
        guard var line = try? JSONEncoder().encode(fact) else { return }
        line.append(0x0a)   // newline-delimited
        ensureFileExists()
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: line)
    }

    private func ensureFileExists() {
        let fm = FileManager.default
        try? fm.createDirectory(at: url.deletingLastPathComponent(),
                                withIntermediateDirectories: true)
        if !fm.fileExists(atPath: url.path) {
            fm.createFile(atPath: url.path, contents: nil)
        }
    }
}

@MainActor
final class AuditLog {
    static let genesisHash = String(repeating: "0", count: 64)

    /// Default on-disk home for the chain: Application Support/AuthBox.
    static func defaultStoreURL() -> URL? {
        let fm = FileManager.default
        guard let base = try? fm.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                     appropriateFor: nil, create: true) else { return nil }
        return base.appendingPathComponent("AuthBox/audit-chain.jsonl")
    }

    private(set) var facts: [AuditFact] = []
    /// True iff the chain loaded from disk verified intact at startup. A false
    /// value means the persisted log was tampered with or truncated.
    private(set) var loadedIntegrityOK = true
    private let store: AuditFileStore?
    private let now: () -> Date

    /// In-memory log (tests / ephemeral). No persistence.
    init(now: @escaping () -> Date = Date.init) {
        self.now = now
        self.store = nil
    }

    /// Persisted log (SEC-002): loads any prior chain from `url` and continues
    /// it, sealing every new Fact to disk. Sets `loadedIntegrityOK` from a
    /// verify() of the loaded chain.
    init(url: URL, now: @escaping () -> Date = Date.init) {
        self.now = now
        let store = AuditFileStore(url: url)
        self.store = store
        self.facts = store.load()
        self.loadedIntegrityOK = verify()
    }

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
        store?.append(fact)   // SEC-002: seal to disk immediately
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
