//
//  PolicyEngineTests.swift
//  P4 — deny-by-default contract tests. Mirrors policy-engine.test.ts fail-closed
//  cases and adds per-type coverage with an injected clock.
//

import XCTest
@testable import AuthBoxMac

@MainActor
final class PolicyEngineTests: XCTestCase {

    private let epoch = Date(timeIntervalSince1970: 0)

    private func policy(_ type: PolicyType, rules: PolicyRules,
                        priority: Int = 1, enabled: Bool = true, id: String = "policy-1") -> AgentPolicy {
        AgentPolicy(id: id, agentId: "agent-1", policyType: type, rules: rules,
                    priority: priority, enabled: enabled, createdAt: epoch, updatedAt: epoch)
    }

    private func intent(_ action: AgentAction = .read, itemType: String? = nil, itemId: String? = nil) -> AccessIntent {
        AccessIntent(agentId: "agent-1", action: action, itemType: itemType, itemId: itemId)
    }

    // MARK: - Fail-closed contract (mirrors policy-engine.test.ts)

    func test_no_policies_denies() {
        let e = PolicyEngine()
        XCTAssertFalse(e.evaluate([], intent: intent()).allowed)
    }

    func test_all_disabled_denies() {
        let e = PolicyEngine()
        let p = policy(.action_perm, rules: PolicyRules(allowedActions: [.read]), enabled: false)
        let d = e.evaluate([p], intent: intent())
        XCTAssertFalse(d.allowed)
        XCTAssertEqual(d.reason, "All policies disabled")
    }

    func test_scoped_policy_missing_item_type_denies() {
        let e = PolicyEngine()
        let p = policy(.item_scope, rules: PolicyRules(allowedItemTypes: ["login"], allowedItemIds: ["GitHub"]))
        let d = e.evaluate([p], intent: intent(.read))   // no itemType
        XCTAssertFalse(d.allowed)
        XCTAssertTrue(d.reason.contains("Missing item type"))
    }

    // MARK: - Action permission

    func test_action_permission_allows_and_denies() {
        let e = PolicyEngine()
        let p = policy(.action_perm, rules: PolicyRules(allowedActions: [.read]))
        XCTAssertTrue(e.evaluate([p], intent: intent(.read)).allowed)
        XCTAssertFalse(e.evaluate([p], intent: intent(.proxy)).allowed)
    }

    // MARK: - Rate limit (injected clock)

    func test_rate_limit_denies_after_threshold() {
        var clock = Date(timeIntervalSince1970: 1000)
        let e = PolicyEngine(now: { clock })
        let p = policy(.rate_limit, rules: PolicyRules(maxRequests: 2, windowSeconds: 60))
        XCTAssertTrue(e.evaluate([p], intent: intent()).allowed)   // 1
        XCTAssertTrue(e.evaluate([p], intent: intent()).allowed)   // 2
        XCTAssertFalse(e.evaluate([p], intent: intent()).allowed)  // 3 → over
        clock = clock.addingTimeInterval(61)                       // new window
        XCTAssertTrue(e.evaluate([p], intent: intent()).allowed)
    }

    // MARK: - Time window (injected clock)

    func test_time_window_blocks_outside_hours() {
        // 02:00 UTC-ish; allow only 9-17.
        let twoAM = Calendar.current.date(bySettingHour: 2, minute: 0, second: 0, of: Date(timeIntervalSince1970: 1_700_000_000))!
        let e = PolicyEngine(now: { twoAM })
        let p = policy(.time_window, rules: PolicyRules(allowedHours: .init(start: 9, end: 17)))
        XCTAssertFalse(e.evaluate([p], intent: intent()).allowed)
    }

    // MARK: - Step-up (async approval, deny by default)

    func test_step_up_requires_approval_then_resolves() async {
        let e = PolicyEngine(makeApprovalId: { "fixed-approval" })
        let p = policy(.step_up, rules: PolicyRules(requireApproval: true))
        let decision = e.evaluate([p], intent: intent(.use))
        XCTAssertFalse(decision.allowed, "step-up denies until approved")
        XCTAssertEqual(decision.pendingApprovalId, "fixed-approval")

        // Drive resolution causally off the approval notification — no timing guess.
        e.onApprovalNeeded = { approval in
            Task { @MainActor in e.resolveApproval(approval.id, approved: true) }
        }
        let result = await e.requestApproval("fixed-approval", intent: intent(.use))
        XCTAssertTrue(result, "approval resumes the suspended request")
    }

    func test_step_up_denies_when_rejected() async {
        let e = PolicyEngine(makeApprovalId: { "reject-me" })
        e.onApprovalNeeded = { approval in
            Task { @MainActor in e.resolveApproval(approval.id, approved: false) }
        }
        let result = await e.requestApproval("reject-me", intent: intent(.use))
        XCTAssertFalse(result, "explicit denial → false")
    }

    func test_all_policies_must_pass() {
        let e = PolicyEngine()
        let allow = policy(.action_perm, rules: PolicyRules(allowedActions: [.read]), priority: 10, id: "a")
        let scope = policy(.item_scope, rules: PolicyRules(allowedItemIds: ["GitHub"]), priority: 5, id: "b")
        // read is allowed, but item scope requires itemId → missing → deny
        let d = e.evaluate([allow, scope], intent: intent(.read))
        XCTAssertFalse(d.allowed)
        XCTAssertEqual(d.appliedPolicies, ["a", "b"])   // evaluated in priority order
    }
}
