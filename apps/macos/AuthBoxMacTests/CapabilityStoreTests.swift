//
//  CapabilityStoreTests.swift
//  P4 — proves granted agents are restart-durable: a capability persisted by one
//  AuthorizationCenter is reloaded by the next, and the bearer token issued before
//  the "restart" still authenticates afterwards. This is what makes "wire an AI
//  agent" a durable integration rather than a single-session promise.
//

import XCTest
@testable import AuthBoxMac

@MainActor
final class CapabilityStoreTests: XCTestCase {

    private var tmpDir: URL!
    private var storeURL: URL!

    override func setUpWithError() throws {
        tmpDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("authbox-captest-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        storeURL = tmpDir.appendingPathComponent("capabilities.json")
    }

    override func tearDownWithError() throws {
        if let tmpDir { try? FileManager.default.removeItem(at: tmpDir) }
    }

    private func makeCenter() -> AuthorizationCenter {
        AuthorizationCenter(engine: PolicyEngine(), audit: AuditLog(),
                            capabilityStore: CapabilityStore(url: storeURL))
    }

    /// Raw store round-trip: token hash and policy set survive encode→decode intact.
    func test_store_round_trip_preserves_hash_and_policies() throws {
        let store = CapabilityStore(url: storeURL)
        XCTAssertTrue(store.load().isEmpty, "fresh store starts empty")

        let token = AgentToken.generate()
        let cap = AgentCapability(
            id: "agent_x", name: "X",
            policies: [AgentPolicy(id: "agent_x_scope", agentId: "agent_x", policyType: .item_scope,
                                   rules: PolicyRules(allowedItemTypes: ["llm"]),
                                   priority: 20, enabled: true,
                                   createdAt: Date(timeIntervalSince1970: 0),
                                   updatedAt: Date(timeIntervalSince1970: 0))],
            tokenHash: AgentToken.hash(token))
        store.save([cap])

        let loaded = store.load()
        XCTAssertEqual(loaded, [cap])
        XCTAssertTrue(AgentToken.matches(token, storedHash: loaded[0].tokenHash),
                      "token still verifies against the reloaded hash")
    }

    /// The real scenario: grant an agent in one Center ("session 1"), then build a
    /// fresh Center from the same store ("after restart"). The agent and its token
    /// hash must survive, so the token the operator copied still authenticates.
    func test_granted_agent_survives_restart() throws {
        let token: String
        do {
            let center1 = makeCenter()
            XCTAssertTrue(center1.capabilities.isEmpty)
            token = center1.addScopedCapability(
                name: "Fleet", allowedItemTypes: ["llm"], allowedActions: [.read, .use],
                maxRequests: 60, windowSeconds: 3600, requireStepUp: true).token
            XCTAssertEqual(center1.capabilities.count, 1)
        }   // center1 goes away — simulate app quit

        let center2 = makeCenter()                 // simulate relaunch from the same store
        XCTAssertEqual(center2.capabilities.count, 1, "grant reloaded after restart")
        let cap = try XCTUnwrap(center2.capabilities.first)
        XCTAssertEqual(cap.name, "Fleet")
        XCTAssertEqual(Set(cap.policies.map(\.policyType)),
                       [.item_scope, .action_perm, .rate_limit, .step_up], "full policy set survived")
        XCTAssertTrue(AgentToken.matches(token, storedHash: cap.tokenHash),
                      "the pre-restart bearer token still authenticates")
        XCTAssertFalse(AgentToken.matches("forged", storedHash: cap.tokenHash))
    }

    /// Revocation is durable too: a revoked agent does not reappear after restart.
    func test_revoked_agent_stays_gone_after_restart() throws {
        let center1 = makeCenter()
        _ = center1.addScopedCapability(name: "Temp", allowedItemTypes: ["llm"],
                                        allowedActions: [.read], requireStepUp: true)
        let cap = try XCTUnwrap(center1.capabilities.first)
        center1.revoke(cap)
        XCTAssertTrue(center1.capabilities.isEmpty)

        let center2 = makeCenter()
        XCTAssertTrue(center2.capabilities.isEmpty, "revocation persisted across restart")
    }
}
