//
//  DelegationModel.swift
//  P4 — the 五原语 (five primitives) delegation vocabulary, ported from the
//  monorepo's mcp-protocol policy model.
//
//    Capability — what an agent has been granted (an agent + its policy set).
//    Intent     — what the agent is asking to do right now (a single request).
//    Policy     — a rule that constrains capabilities.
//    Effect     — the decision produced by evaluating policies against an intent.
//    Fact       — the immutable audit record of an effect (see AuditLog).
//
//  Deny-by-default is the contract: anything not explicitly allowed is denied.
//

import Foundation
import CryptoKit

/// Bearer-token authentication for agents (SEC-001). Loopback locality proves a
/// peer is on 127.0.0.1 — it does NOT prove which process it is, since every
/// local process shares the loopback interface. A per-agent secret closes that
/// gap: the plaintext token is shown to the operator exactly once at grant time
/// and never stored; only its SHA-256 hash lives in the capability (the
/// /etc/shadow model). Every intent must present the matching token.
enum AgentToken {
    /// A 256-bit token from a CSPRNG (CryptoKit's SymmetricKey RNG).
    static func generate() -> String {
        SymmetricKey(size: .bits256).withUnsafeBytes { Data($0).base64EncodedString() }
    }

    /// Lowercase-hex SHA-256 of the token. This is what the capability persists.
    static func hash(_ token: String) -> String {
        SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Constant-time check of a presented token against a stored hash. Compares
    /// the two fixed-length (64-char) hex digests byte-by-byte without early
    /// exit, so timing never reveals how many leading characters matched. Empty
    /// stored hash or nil token fail closed.
    static func matches(_ presented: String?, storedHash: String) -> Bool {
        guard let presented, !storedHash.isEmpty else { return false }
        let a = Array(hash(presented).utf8)
        let b = Array(storedHash.utf8)
        guard a.count == b.count else { return false }
        var diff: UInt8 = 0
        for i in a.indices { diff |= a[i] ^ b[i] }
        return diff == 0
    }
}

enum AgentAction: String, Codable, CaseIterable, Equatable {
    case read, use, proxy
}

enum PolicyType: String, Codable, CaseIterable, Equatable {
    case item_scope, action_perm, rate_limit, time_window, step_up
}

/// The constraints a policy enforces. Mirrors PolicyRules in shared/types/agent.ts.
struct PolicyRules: Codable, Equatable {
    var allowedItemTypes: [String]?
    var allowedItemIds: [String]?
    var allowedFolderIds: [String]?
    var deniedItemIds: [String]?

    var allowedActions: [AgentAction]?

    var maxRequests: Int?
    var windowSeconds: Int?

    var allowedHours: HourWindow?
    var allowedDays: [Int]?          // 0 = Sunday … 6 = Saturday

    var requireApproval: Bool?
    var approvalTimeoutSeconds: Int?

    struct HourWindow: Codable, Equatable { var start: Int; var end: Int }
}

/// 原语 3 — Policy. One rule, with priority and an enable flag.
struct AgentPolicy: Identifiable, Codable, Equatable {
    var id: String
    var agentId: String
    var policyType: PolicyType
    var rules: PolicyRules
    var priority: Int
    var enabled: Bool
    var createdAt: Date
    var updatedAt: Date
}

/// 原语 1 — Capability. An agent and the policy set granted to it. `tokenHash`
/// is the SHA-256 of the agent's bearer token (SEC-001); the plaintext is never
/// stored here. An empty hash means "no token issued" → the agent cannot
/// authenticate (deny-by-default).
struct AgentCapability: Identifiable, Codable, Equatable {
    var id: String          // == agentId
    var name: String
    var policies: [AgentPolicy]
    var tokenHash: String = ""
    var agentId: String { id }
}

/// 原语 2 — Intent. A single access request from an agent. `token` is the
/// bearer secret the agent presents; the broker authenticates it against the
/// capability's `tokenHash` before any policy evaluation (SEC-001).
struct AccessIntent: Codable, Equatable {
    var agentId: String
    var action: AgentAction
    var itemType: String?
    var itemId: String?
    var folderId: String?
    var token: String?
}

/// 原语 4 — Effect. The decision produced by the engine.
struct AccessEffect: Codable, Equatable {
    var allowed: Bool
    var reason: String
    var appliedPolicies: [String]
    /// Set when step-up is required; tracks the pending approval.
    var pendingApprovalId: String?
}
