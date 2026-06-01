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

    private func capability() -> [String: AgentCapability] {
        let stamp = Date(timeIntervalSince1970: 0)
        let cap = AgentCapability(id: "agent-1", name: "Test Agent", policies: [
            AgentPolicy(id: "p-action", agentId: "agent-1", policyType: .action_perm,
                        rules: PolicyRules(allowedActions: [.read]),
                        priority: 10, enabled: true, createdAt: stamp, updatedAt: stamp),
        ])
        return [cap.id: cap]
    }

    private func makeBroker() -> AuthorizationBroker {
        AuthorizationBroker(engine: PolicyEngine(), audit: AuditLog(), capabilities: capability)
    }

    // MARK: - Decision pipeline (no network)

    func test_decide_allows_permitted_action_and_audits() async {
        let audit = AuditLog()
        let broker = AuthorizationBroker(engine: PolicyEngine(), audit: audit, capabilities: capability)
        let effect = await broker.decide(AccessIntent(agentId: "agent-1", action: .read))
        XCTAssertTrue(effect.allowed)
        XCTAssertEqual(audit.facts.count, 1, "every decision is sealed into the audit log")
        XCTAssertTrue(audit.verify())
    }

    func test_decide_denies_unknown_agent() async {
        let broker = makeBroker()
        let effect = await broker.decide(AccessIntent(agentId: "ghost", action: .read))
        XCTAssertFalse(effect.allowed, "unknown agent → no policies → deny")
    }

    func test_decide_denies_unpermitted_action() async {
        let broker = makeBroker()
        let effect = await broker.decide(AccessIntent(agentId: "agent-1", action: .proxy))
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
            AccessIntent(agentId: "agent-1", action: .read), toPort: port)
        XCTAssertTrue(effect.allowed, "permitted action returns allowed over the socket")
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
