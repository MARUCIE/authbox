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

/// 原语 1 — Capability. An agent and the policy set granted to it.
struct AgentCapability: Identifiable, Codable, Equatable {
    var id: String          // == agentId
    var name: String
    var policies: [AgentPolicy]
    var agentId: String { id }
}

/// 原语 2 — Intent. A single access request from an agent.
struct AccessIntent: Codable, Equatable {
    var agentId: String
    var action: AgentAction
    var itemType: String?
    var itemId: String?
    var folderId: String?
}

/// 原语 4 — Effect. The decision produced by the engine.
struct AccessEffect: Codable, Equatable {
    var allowed: Bool
    var reason: String
    var appliedPolicies: [String]
    /// Set when step-up is required; tracks the pending approval.
    var pendingApprovalId: String?
}
