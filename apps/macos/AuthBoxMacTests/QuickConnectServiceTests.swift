//
//  QuickConnectServiceTests.swift
//  P4 — proves the one-click "import credentials + wire an AI agent" loop end to
//  end over the REAL components (in-memory vault, real crypto, real PolicyEngine,
//  real AuthorizationBroker). No mocks: the only thing not exercised is the
//  loopback socket bind (broker.decide is called directly) and Touch ID step-up.
//

import XCTest
@testable import AuthBoxMac
import AuthBoxCrypto

@MainActor
final class QuickConnectServiceTests: XCTestCase {

    // Two providers in two categories: OpenAI → "llm", Stripe → "payment".
    private let env = """
    OPENAI_API_KEY=sk-openai-xxxx
    STRIPE_SECRET_KEY=sk_live_stripexxxx
    """

    private func makeStack() throws -> (svc: QuickConnectService,
                                        center: AuthorizationCenter,
                                        engine: PolicyEngine,
                                        audit: AuditLog,
                                        key: Data) {
        let vault = VaultService(store: try VaultStore(inMemory: true))
        let importer = ProviderImportService(vault: vault)
        let engine = PolicyEngine()
        let audit = AuditLog()                       // in-memory audit chain
        // capabilityStore: nil ⇒ ephemeral; this test must not touch the on-disk grant store.
        let center = AuthorizationCenter(engine: engine, audit: audit, capabilityStore: nil)
        let svc = QuickConnectService(importer: importer, registrar: center)
        return (svc, center, engine, audit, VaultCrypto.generateVaultKey())
    }

    /// One connect imports both credentials and issues exactly one agent, scoped to
    /// exactly the imported categories, with the full least-privilege policy set.
    func test_connect_imports_and_grants_scoped_agent() throws {
        let s = try makeStack()
        let outcome = try s.svc.connect(content: env, agentName: "Claude Fleet", vaultKey: s.key)

        XCTAssertEqual(outcome.importedCount, 2)
        XCTAssertEqual(Set(outcome.scopedItemTypes), ["llm", "payment"])
        XCTAssertFalse(outcome.token.isEmpty)

        XCTAssertEqual(s.center.capabilities.count, 1)
        let cap = try XCTUnwrap(s.center.capabilities.first)
        XCTAssertEqual(cap.id, outcome.agentId)

        // Least-privilege envelope: scope + action + rate-limit + step-up.
        XCTAssertEqual(Set(cap.policies.map(\.policyType)),
                       [.item_scope, .action_perm, .rate_limit, .step_up])
        let scope = try XCTUnwrap(cap.policies.first { $0.policyType == .item_scope })
        XCTAssertEqual(Set(scope.rules.allowedItemTypes ?? []), ["llm", "payment"])

        // The token is returned once; only its hash is stored, and it verifies.
        XCTAssertTrue(AgentToken.matches(outcome.token, storedHash: cap.tokenHash))
        XCTAssertFalse(AgentToken.matches("wrong-token", storedHash: cap.tokenHash))
    }

    /// In-scope read with the right token passes scope + action + rate-limit and
    /// stops at step-up (pendingApprovalId set) — i.e. the agent CAN reach an
    /// imported category, gated only by human approval. Evaluated on the engine
    /// directly so the test never suspends on the 60s approval wait.
    func test_in_scope_request_reaches_step_up() throws {
        let s = try makeStack()
        let outcome = try s.svc.connect(content: env, agentName: "Fleet", vaultKey: s.key)
        let cap = try XCTUnwrap(s.center.capabilities.first)

        let intent = AccessIntent(agentId: outcome.agentId, action: .read,
                                  itemType: "llm", itemId: nil, folderId: nil,
                                  token: outcome.token)
        let effect = s.engine.evaluate(cap.policies, intent: intent)

        XCTAssertFalse(effect.allowed, "step-up gates the final allow")
        XCTAssertNotNil(effect.pendingApprovalId, "scope+action+rate passed → step-up pending")
        XCTAssertTrue(effect.appliedPolicies.contains(cap.policies.first { $0.policyType == .item_scope }!.id))
    }

    /// A category the agent did NOT import is denied at the item-scope gate — proven
    /// through the real broker decision path (no step-up reached, so no suspension).
    func test_out_of_scope_category_is_denied_by_broker() async throws {
        let s = try makeStack()
        let outcome = try s.svc.connect(content: env, agentName: "Fleet", vaultKey: s.key)
        let broker = AuthorizationBroker(engine: s.engine, audit: s.audit,
            capabilities: { Dictionary(uniqueKeysWithValues: s.center.capabilities.map { ($0.id, $0) }) })

        let intent = AccessIntent(agentId: outcome.agentId, action: .read,
                                  itemType: "banking", itemId: nil, folderId: nil,
                                  token: outcome.token)
        let effect = await broker.decide(intent)

        XCTAssertFalse(effect.allowed)
        XCTAssertTrue(effect.reason.contains("not in allowed types"), "got: \(effect.reason)")
    }

    /// A correct agent id with a bad token is rejected before any policy runs — the
    /// SEC-001 authentication gate (loopback proves locality, not identity).
    func test_bad_token_is_rejected_by_broker() async throws {
        let s = try makeStack()
        let outcome = try s.svc.connect(content: env, agentName: "Fleet", vaultKey: s.key)
        let broker = AuthorizationBroker(engine: s.engine, audit: s.audit,
            capabilities: { Dictionary(uniqueKeysWithValues: s.center.capabilities.map { ($0.id, $0) }) })

        let intent = AccessIntent(agentId: outcome.agentId, action: .read,
                                  itemType: "llm", itemId: nil, folderId: nil,
                                  token: "forged-token")
        let effect = await broker.decide(intent)

        XCTAssertFalse(effect.allowed)
        XCTAssertTrue(effect.reason.contains("authentication failed"), "got: \(effect.reason)")
    }
}
