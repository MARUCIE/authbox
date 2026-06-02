//
//  BrokerTests.swift
//  P4 — broker decision pipeline (deterministic, no network) plus a real
//  loopback WebSocket round-trip proving intent → effect over ws://127.0.0.1.
//

import XCTest
import Network
@testable import AuthBoxMac

@MainActor
final class BrokerTests: XCTestCase {

    /// The bearer token the test agent presents (SEC-001). The capability stores
    /// only its hash; intents must carry the plaintext.
    private static let token = "broker-test-bearer-token"

    private func capability() -> [String: AgentCapability] {
        let stamp = Date(timeIntervalSince1970: 0)
        let cap = AgentCapability(id: "agent-1", name: "Test Agent", policies: [
            AgentPolicy(id: "p-action", agentId: "agent-1", policyType: .action_perm,
                        rules: PolicyRules(allowedActions: [.read]),
                        priority: 10, enabled: true, createdAt: stamp, updatedAt: stamp),
        ], tokenHash: AgentToken.hash(BrokerTests.token))
        return [cap.id: cap]
    }

    /// A capability that REQUIRES Touch ID step-up for each access (action_perm +
    /// step_up). Mirrors what `addCapability(requireStepUp: true)` builds in the UI.
    private func stepUpCapability() -> [String: AgentCapability] {
        let stamp = Date(timeIntervalSince1970: 0)
        let cap = AgentCapability(id: "agent-1", name: "Test Agent", policies: [
            AgentPolicy(id: "p-action", agentId: "agent-1", policyType: .action_perm,
                        rules: PolicyRules(allowedActions: [.read]),
                        priority: 10, enabled: true, createdAt: stamp, updatedAt: stamp),
            AgentPolicy(id: "p-stepup", agentId: "agent-1", policyType: .step_up,
                        rules: PolicyRules(requireApproval: true),
                        priority: 5, enabled: true, createdAt: stamp, updatedAt: stamp),
        ], tokenHash: AgentToken.hash(BrokerTests.token))
        return [cap.id: cap]
    }

    private func authedIntent(_ action: AgentAction) -> AccessIntent {
        AccessIntent(agentId: "agent-1", action: action, token: BrokerTests.token)
    }

    private func makeBroker() -> AuthorizationBroker {
        AuthorizationBroker(engine: PolicyEngine(), audit: AuditLog(), capabilities: capability)
    }

    // MARK: - Decision pipeline (no network)

    func test_decide_allows_permitted_action_and_audits() async {
        let audit = AuditLog()
        let broker = AuthorizationBroker(engine: PolicyEngine(), audit: audit, capabilities: capability)
        let effect = await broker.decide(authedIntent(.read))
        XCTAssertTrue(effect.allowed)
        XCTAssertEqual(audit.facts.count, 1, "every decision is sealed into the audit log")
        XCTAssertTrue(audit.verify())
    }

    func test_decide_denies_unknown_agent() async {
        let broker = makeBroker()
        let effect = await broker.decide(AccessIntent(agentId: "ghost", action: .read, token: BrokerTests.token))
        XCTAssertFalse(effect.allowed, "unknown agent → no capability → deny")
        XCTAssertEqual(effect.reason, "Unknown agent")
    }

    func test_decide_denies_wrong_token() async {
        let audit = AuditLog()
        let broker = AuthorizationBroker(engine: PolicyEngine(), audit: audit, capabilities: capability)
        // Valid agent + permitted action, but no/incorrect bearer token (SEC-001).
        let noToken = await broker.decide(AccessIntent(agentId: "agent-1", action: .read))
        XCTAssertFalse(noToken.allowed, "loopback locality is not identity — absent token → deny")
        XCTAssertEqual(noToken.reason, "Agent authentication failed")
        let badToken = await broker.decide(AccessIntent(agentId: "agent-1", action: .read, token: "wrong"))
        XCTAssertFalse(badToken.allowed, "wrong token → deny")
        XCTAssertEqual(audit.facts.count, 2, "failed auth attempts are themselves audited")
        XCTAssertTrue(audit.verify())
    }

    func test_decide_denies_unpermitted_action() async {
        let broker = makeBroker()
        let effect = await broker.decide(authedIntent(.proxy))
        XCTAssertFalse(effect.allowed)
    }

    func test_decide_rejects_malformed_payload() async {
        let broker = makeBroker()
        let effect = await broker.decide(Data("not json".utf8))
        XCTAssertFalse(effect.allowed)
        XCTAssertEqual(effect.reason, "Malformed intent")
    }

    // MARK: - Real loopback WebSocket round-trip

    func test_loopback_websocket_round_trip() async throws {
        let port: UInt16 = 19911
        let broker = makeBroker()
        try broker.start(on: port)

        // Wait for the listener to be ready.
        try await waitUntil(timeout: 3) { broker.isRunning }
        defer { broker.stop() }

        let effect = try await sendIntent(
            AccessIntent(agentId: "agent-1", action: .read, token: BrokerTests.token), toPort: port)
        XCTAssertTrue(effect.allowed, "permitted action returns allowed over the socket")
    }

    // MARK: - Step-up consent path (approve / deny → effect + audit)

    func test_decide_stepup_approved_is_allowed_and_audited() async {
        let engine = PolicyEngine()
        let audit = AuditLog()
        let broker = AuthorizationBroker(engine: engine, audit: audit, capabilities: stepUpCapability)

        // Stand in for the human's "Allow once" + a SUCCESSFUL Touch ID. The
        // biometric sensor is the one seam a CI/test env cannot drive; everything
        // downstream of a positive check — resolve → effect → seal — runs for real.
        // register-before-notify (PolicyEngine) guarantees the resolver is already
        // installed when this fires, so resolving synchronously is race-free.
        var approvalsSeen = 0
        engine.onApprovalNeeded = { [weak engine] approval in
            approvalsSeen += 1
            engine?.resolveApproval(approval.id, approved: true)
        }

        let effect = await broker.decide(authedIntent(.read))
        XCTAssertEqual(approvalsSeen, 1, "a step-up policy must raise exactly one consent prompt")
        XCTAssertTrue(effect.allowed, "approved step-up → allowed")
        XCTAssertEqual(effect.reason, "Approved via step-up")
        XCTAssertEqual(audit.facts.count, 1, "the approved decision is sealed into the audit log")
        XCTAssertTrue(audit.verify())
    }

    func test_decide_stepup_denied_is_blocked_and_audited() async {
        let engine = PolicyEngine()
        let audit = AuditLog()
        let broker = AuthorizationBroker(engine: engine, audit: audit, capabilities: stepUpCapability)

        // Stand in for the human pressing "Deny" (or a FAILED Touch ID): the
        // consent resolves false. Deny-by-default must hold and the rejected
        // attempt must still be sealed (tamper-evident).
        engine.onApprovalNeeded = { [weak engine] approval in
            engine?.resolveApproval(approval.id, approved: false)
        }

        let effect = await broker.decide(authedIntent(.read))
        XCTAssertFalse(effect.allowed, "denied step-up → blocked, fail-closed")
        XCTAssertEqual(effect.reason, "Denied or timed out at step-up")
        XCTAssertEqual(audit.facts.count, 1, "the denied decision is still sealed (tamper-evident)")
        XCTAssertTrue(audit.verify())
    }

    /// The full closed loop the live Touch ID demo would have shown, minus the
    /// physical sensor: a real agent client sends an intent over ws://127.0.0.1,
    /// the broker raises step-up consent, the consent is approved, and the
    /// allowed effect travels back over the same socket and is sealed in the audit.
    func test_loopback_websocket_stepup_round_trip() async throws {
        let port: UInt16 = 19912
        let engine = PolicyEngine()
        let audit = AuditLog()
        let broker = AuthorizationBroker(engine: engine, audit: audit, capabilities: stepUpCapability)

        engine.onApprovalNeeded = { [weak engine] approval in
            engine?.resolveApproval(approval.id, approved: true)   // human Touch ID stand-in
        }

        try broker.start(on: port)
        try await waitUntil(timeout: 3) { broker.isRunning }
        defer { broker.stop() }

        let effect = try await sendIntent(authedIntent(.read), toPort: port)
        XCTAssertTrue(effect.allowed, "approved step-up returns allowed over the socket")
        XCTAssertEqual(effect.reason, "Approved via step-up")
        XCTAssertEqual(audit.facts.count, 1, "the socket-driven step-up decision is sealed")
        XCTAssertTrue(audit.verify())
    }

    // MARK: - Helpers

    private func waitUntil(timeout: TimeInterval, _ cond: @escaping () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !cond() {
            if Date() > deadline { XCTFail("condition not met within \(timeout)s"); return }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    /// Connect a real WebSocket client to the broker, send one intent, return the effect.
    private func sendIntent(_ intent: AccessIntent, toPort port: UInt16) async throws -> AccessEffect {
        let params = NWParameters.tcp
        let ws = NWProtocolWebSocket.Options()
        ws.autoReplyPing = true
        params.defaultProtocolStack.applicationProtocols.insert(ws, at: 0)

        let conn = NWConnection(to: .url(URL(string: "ws://127.0.0.1:\(port)")!), using: params)
        let queue = DispatchQueue(label: "test.ws.client")
        conn.start(queue: queue)

        return try await withCheckedThrowingContinuation { cont in
            var resumed = false
            func finish(_ result: Result<AccessEffect, Error>) {
                guard !resumed else { return }
                resumed = true
                conn.cancel()
                cont.resume(with: result)
            }
            conn.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    let payload = (try? JSONEncoder().encode(intent)) ?? Data()
                    let meta = NWProtocolWebSocket.Metadata(opcode: .text)
                    let ctx = NWConnection.ContentContext(identifier: "intent", metadata: [meta])
                    conn.send(content: payload, contentContext: ctx, isComplete: true,
                              completion: .contentProcessed { err in
                        if let err { finish(.failure(err)); return }
                        conn.receiveMessage { data, _, _, recvErr in
                            if let recvErr { finish(.failure(recvErr)); return }
                            guard let data, let effect = try? JSONDecoder().decode(AccessEffect.self, from: data) else {
                                finish(.failure(URLError(.cannotParseResponse))); return
                            }
                            finish(.success(effect))
                        }
                    })
                case .failed(let e):
                    finish(.failure(e))
                default:
                    break
                }
            }
        }
    }
}
