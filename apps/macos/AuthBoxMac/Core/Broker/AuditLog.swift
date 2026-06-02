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
/// immediately. The file itself is plaintext — its integrity comes from the hash
/// chain PLUS a Keychain head anchor, not file permissions: verify() catches any
/// edit, reorder, or insertion of a retained entry, and the head anchor (count +
/// last hash, held in the Keychain by AuditLog) catches deletion/truncation of
/// the tail — which a prefix-only chain would otherwise re-verify as intact
/// (BROKER-AUDIT-01).
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

/// The chain's head: how many Facts exist and the hash of the last one. Persisted
/// OUTSIDE the log file so dropping the file's tail is detectable (BROKER-AUDIT-01).
struct AuditHead: Codable, Equatable {
    let count: Int
    let headHash: String
}

/// Stores the head anchor somewhere the log file's editor cannot reach. The
/// Keychain is the right home: device-local, app-scoped, not a plaintext sibling
/// of the .jsonl that a truncation would also control.
protocol AuditHeadAnchorStore: Sendable {
    func load() -> AuditHead?
    func save(_ head: AuditHead)
    func clear()
}

/// Keychain-backed head anchor (generic password, device-local). Mirrors
/// KeychainWrappedKeyStore's pattern.
struct KeychainAuditHeadAnchor: AuditHeadAnchorStore {
    private let service = "com.authbox.mac.audit"
    private let account = "com.authbox.mac.audit-head-anchor"

    private func baseQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func load() -> AuditHead? {
        var q = baseQuery()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(AuditHead.self, from: data)
    }

    func save(_ head: AuditHead) {
        guard let data = try? JSONEncoder().encode(head) else { return }
        var q = baseQuery()
        SecItemDelete(q as CFDictionary)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    func clear() { SecItemDelete(baseQuery() as CFDictionary) }
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
    private let anchor: AuditHeadAnchorStore?
    private let now: () -> Date

    /// In-memory log (tests / ephemeral). No persistence, no head anchor.
    init(now: @escaping () -> Date = Date.init) {
        self.now = now
        self.store = nil
        self.anchor = nil
    }

    /// Persisted log (SEC-002): loads any prior chain from `url` and continues
    /// it, sealing every new Fact to disk. Sets `loadedIntegrityOK` from a verify()
    /// of the loaded chain AND a match against the Keychain head anchor, so a
    /// deleted/truncated tail (which a prefix-only chain re-verifies as intact) is
    /// caught (BROKER-AUDIT-01).
    init(url: URL,
         anchor: AuditHeadAnchorStore = KeychainAuditHeadAnchor(),
         now: @escaping () -> Date = Date.init) {
        self.now = now
        self.store = AuditFileStore(url: url)
        self.anchor = anchor
        self.facts = self.store?.load() ?? []
        // Only adopt/compare the head anchor when the retained chain is itself
        // internally consistent — never anchor a corrupt chain.
        self.loadedIntegrityOK = verify() && verifyHeadAnchor()
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
        // BROKER-AUDIT-01: advance the out-of-file head anchor so a later deletion
        // or truncation of this tail is detectable on next load.
        anchor?.save(AuditHead(count: facts.count, headHash: fact.hash))
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

    /// BROKER-AUDIT-01: the hash chain proves no RETAINED entry changed, but it is
    /// blind to a dropped TAIL — an empty file or any valid prefix re-verifies as
    /// intact. Compare the loaded chain's head (count + last hash) against the
    /// Keychain anchor, which the log-file editor cannot reach. A mismatch means
    /// the tail was deleted/truncated (or forged longer without the app).
    /// Trust-on-first-use: with no anchor yet (fresh install or pre-anchor upgrade),
    /// adopt the current — already linkage-verified — head.
    private func verifyHeadAnchor() -> Bool {
        guard let anchor else { return true }   // in-memory log: nothing to anchor
        let head = AuditHead(count: facts.count, headHash: facts.last?.hash ?? AuditLog.genesisHash)
        guard let stored = anchor.load() else { anchor.save(head); return true }
        return stored == head
    }
}
