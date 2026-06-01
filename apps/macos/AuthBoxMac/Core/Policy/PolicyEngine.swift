//
//  PolicyEngine.swift
//  P4 — deny-by-default policy engine. Faithful port of
//  packages/mcp-protocol/src/policy-engine.ts.
//
//  Contract (fail-closed): no policies → deny; all disabled → deny; unknown
//  type → deny; any single failing policy → deny. An intent is allowed only
//  when EVERY enabled policy passes.
//
//  The clock is injectable so rate-limit and time-window logic is deterministic
//  under test (no wall-clock dependence).
//

import Foundation

struct PendingApproval: Identifiable, Equatable {
    let id: String
    let agentId: String
    let action: AgentAction
    let itemType: String?
    let itemId: String?
    let reason: String
    let createdAt: Date
}

@MainActor
final class PolicyEngine {
    private var rateLimitCounters: [String: (count: Int, windowStart: Date)] = [:]
    private var pendingApprovals: [String: PendingApproval] = [:]
    private var resolvers: [String: CheckedContinuation<Bool, Never>] = [:]
    private var timeoutTasks: [String: Task<Void, Never>] = [:]

    private let now: () -> Date
    private let makeApprovalId: () -> String

    /// Notified when a step-up approval is needed (the consent UI subscribes).
    var onApprovalNeeded: ((PendingApproval) -> Void)?

    init(now: @escaping () -> Date = Date.init,
         makeApprovalId: @escaping () -> String = { "stepup_\(UUID().uuidString)" }) {
        self.now = now
        self.makeApprovalId = makeApprovalId
    }

    // MARK: - Evaluation (deny-by-default)

    func evaluate(_ policies: [AgentPolicy], intent: AccessIntent) -> AccessEffect {
        guard !policies.isEmpty else {
            return AccessEffect(allowed: false, reason: "No policies defined", appliedPolicies: [])
        }
        let enabled = policies.filter(\.enabled).sorted { $0.priority > $1.priority }
        guard !enabled.isEmpty else {
            return AccessEffect(allowed: false, reason: "All policies disabled", appliedPolicies: [])
        }

        var applied: [String] = []
        for policy in enabled {
            applied.append(policy.id)
            let result = evaluateOne(policy, intent: intent)
            if !result.allowed {
                return AccessEffect(allowed: false, reason: result.reason,
                                    appliedPolicies: applied,
                                    pendingApprovalId: result.pendingApprovalId)
            }
        }
        return AccessEffect(allowed: true, reason: "All policies passed", appliedPolicies: applied)
    }

    private func evaluateOne(_ policy: AgentPolicy, intent: AccessIntent)
        -> (allowed: Bool, reason: String, pendingApprovalId: String?) {
        switch policy.policyType {
        case .item_scope:   return checkItemScope(policy.rules, intent)
        case .action_perm:  return checkActionPermission(policy.rules, intent)
        case .rate_limit:   return checkRateLimit(intent.agentId, policy.rules)
        case .time_window:  return checkTimeWindow(policy.rules)
        case .step_up:      return checkStepUp(policy.rules)
        }
    }

    // MARK: - Per-type checks

    private func checkItemScope(_ r: PolicyRules, _ intent: AccessIntent)
        -> (Bool, String, String?) {
        if let denied = r.deniedItemIds, denied.contains(intent.itemId ?? "") {
            return (false, "Item explicitly denied", nil)
        }
        if r.allowedItemTypes != nil, intent.itemType == nil {
            return (false, "Missing item type for scoped policy", nil)
        }
        if let types = r.allowedItemTypes, let t = intent.itemType, !types.contains(t) {
            return (false, "Item type '\(t)' not in allowed types", nil)
        }
        if r.allowedItemIds != nil, intent.itemId == nil {
            return (false, "Missing item ID for scoped policy", nil)
        }
        if let ids = r.allowedItemIds, let i = intent.itemId, !ids.contains(i) {
            return (false, "Item ID not in allowed list", nil)
        }
        if r.allowedFolderIds != nil, intent.folderId == nil {
            return (false, "Missing folder ID for scoped policy", nil)
        }
        if let folders = r.allowedFolderIds, let f = intent.folderId, !folders.contains(f) {
            return (false, "Folder not in allowed list", nil)
        }
        return (true, "Item scope check passed", nil)
    }

    private func checkActionPermission(_ r: PolicyRules, _ intent: AccessIntent)
        -> (Bool, String, String?) {
        guard let allowed = r.allowedActions, !allowed.isEmpty else {
            return (true, "No action restrictions", nil)
        }
        if !allowed.contains(intent.action) {
            return (false, "Action '\(intent.action.rawValue)' not permitted", nil)
        }
        return (true, "Action permitted", nil)
    }

    private func checkRateLimit(_ agentId: String, _ r: PolicyRules) -> (Bool, String, String?) {
        guard let maxRequests = r.maxRequests, let windowSeconds = r.windowSeconds else {
            return (true, "No rate limit configured", nil)
        }
        let current = now()
        let window = TimeInterval(windowSeconds)
        if let counter = rateLimitCounters[agentId],
           current.timeIntervalSince(counter.windowStart) <= window {
            if counter.count >= maxRequests {
                return (false, "Rate limit exceeded: \(maxRequests) requests per \(windowSeconds)s", nil)
            }
            rateLimitCounters[agentId] = (counter.count + 1, counter.windowStart)
            return (true, "Rate limit check passed", nil)
        }
        rateLimitCounters[agentId] = (1, current)
        return (true, "Rate limit check passed", nil)
    }

    private func checkTimeWindow(_ r: PolicyRules) -> (Bool, String, String?) {
        guard let hours = r.allowedHours else { return (true, "No time window restriction", nil) }
        let cal = Calendar.current
        let comps = cal.dateComponents([.hour, .weekday], from: now())
        let hour = comps.hour ?? 0
        let inWindow = hours.start <= hours.end
            ? (hour >= hours.start && hour < hours.end)
            : (hour >= hours.start || hour < hours.end)   // wraps midnight
        if !inWindow {
            return (false, "Current hour \(hour) outside allowed window \(hours.start)-\(hours.end)", nil)
        }
        if let days = r.allowedDays {
            let day = (comps.weekday ?? 1) - 1   // Calendar weekday is 1=Sun; normalize to 0=Sun
            if !days.contains(day) {
                return (false, "Day \(day) not in allowed days", nil)
            }
        }
        return (true, "Time window check passed", nil)
    }

    private func checkStepUp(_ r: PolicyRules) -> (Bool, String, String?) {
        guard r.requireApproval == true else { return (true, "No step-up required", nil) }
        return (false, "Step-up approval required", makeApprovalId())
    }

    // MARK: - Step-up approval (async, deny on timeout)

    /// Suspend until the user approves/denies, or the timeout auto-rejects.
    /// Register-before-notify: the resolver is installed synchronously inside the
    /// continuation body BEFORE onApprovalNeeded fires, so a consumer that resolves
    /// immediately (fast UI, or a test) never races a not-yet-registered resolver.
    func requestApproval(_ approvalId: String, intent: AccessIntent,
                         timeoutSeconds: Double = 60) async -> Bool {
        await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            resolvers[approvalId] = c
            let pending = PendingApproval(
                id: approvalId, agentId: intent.agentId, action: intent.action,
                itemType: intent.itemType, itemId: intent.itemId,
                reason: "Step-up approval required for this action", createdAt: now())
            pendingApprovals[approvalId] = pending
            timeoutTasks[approvalId] = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
                self?.resolveApproval(approvalId, approved: false)   // fail-closed on timeout
            }
            onApprovalNeeded?(pending)
        }
    }

    @discardableResult
    func resolveApproval(_ approvalId: String, approved: Bool) -> Bool {
        guard let c = resolvers.removeValue(forKey: approvalId) else { return false }
        pendingApprovals.removeValue(forKey: approvalId)
        timeoutTasks.removeValue(forKey: approvalId)?.cancel()
        c.resume(returning: approved)
        return true
    }

    func getPendingApprovals() -> [PendingApproval] { Array(pendingApprovals.values) }
    func resetCounters() { rateLimitCounters.removeAll() }
}
