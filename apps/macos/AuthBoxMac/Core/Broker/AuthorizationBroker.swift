//
//  AuthorizationBroker.swift
//  P4 — the local MCP authorization gateway. A real WebSocket server bound to
//  127.0.0.1:19876 (loopback only). Agents connect, send an AccessIntent as
//  JSON, and receive an AccessEffect. Every decision runs through the
//  deny-by-default PolicyEngine and is sealed into the tamper-evident AuditLog.
//
//  Loopback enforcement is twofold: the listener requires the loopback interface,
//  and each new connection's peer is checked to be a loopback host. Non-local
//  peers are dropped before any intent is read.
//
//  WebSocket framing uses Network.framework's native NWProtocolWebSocket — no
//  hand-rolled RFC 6455 codec.
//

import Foundation
import Network

@MainActor
final class AuthorizationBroker: ObservableObject {
    static let port: UInt16 = 19876

    @Published private(set) var isRunning = false
    @Published private(set) var lastError: String?

    private var listener: NWListener?
    private let engine: PolicyEngine
    private let audit: AuditLog
    /// Resolves an agentId to its granted capability at decision time.
    private let capabilities: () -> [String: AgentCapability]
    private let queue = DispatchQueue(label: "com.authbox.mac.broker")

    init(engine: PolicyEngine, audit: AuditLog,
         capabilities: @escaping () -> [String: AgentCapability]) {
        self.engine = engine
        self.audit = audit
        self.capabilities = capabilities
    }

    // MARK: - Lifecycle

    func start(on port: UInt16 = AuthorizationBroker.port) throws {
        guard listener == nil else { return }
        let params = NWParameters.tcp
        params.requiredInterfaceType = .loopback          // loopback-only bind
        params.allowLocalEndpointReuse = true
        let ws = NWProtocolWebSocket.Options()
        ws.autoReplyPing = true
        params.defaultProtocolStack.applicationProtocols.insert(ws, at: 0)

        let listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
        listener.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                switch state {
                case .ready:  self?.isRunning = true
                case .failed(let e): self?.lastError = "\(e)"; self?.isRunning = false
                case .cancelled: self?.isRunning = false
                default: break
                }
            }
        }
        listener.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
        listener.start(queue: queue)
        self.listener = listener
    }

    func stop() {
        listener?.cancel()
        listener = nil
        isRunning = false
    }

    // MARK: - Connection handling

    private nonisolated func accept(_ conn: NWConnection) {
        guard isLoopbackPeer(conn) else { conn.cancel(); return }
        conn.start(queue: queue)
        receive(on: conn)
    }

    /// Defense in depth: reject any peer that is not a loopback host.
    private nonisolated func isLoopbackPeer(_ conn: NWConnection) -> Bool {
        if case let .hostPort(host, _) = conn.endpoint {
            switch host {
            case .ipv4(let a): return a.isLoopback
            case .ipv6(let a): return a.isLoopback
            case .name(let n, _): return n == "localhost"
            @unknown default: return false
            }
        }
        return false
    }

    private nonisolated func receive(on conn: NWConnection) {
        conn.receiveMessage { [weak self] data, _, isComplete, error in
            if let data, !data.isEmpty {
                self?.process(data, on: conn)
            }
            if error == nil && !isComplete {
                self?.receive(on: conn)   // keep listening on a persistent socket
            }
        }
    }

    private nonisolated func process(_ data: Data, on conn: NWConnection) {
        Task { @MainActor in
            let effect = await self.decide(data)
            let payload = (try? JSONEncoder().encode(effect)) ?? Data("{}".utf8)
            let meta = NWProtocolWebSocket.Metadata(opcode: .text)
            let ctx = NWConnection.ContentContext(identifier: "effect", metadata: [meta])
            conn.send(content: payload, contentContext: ctx, isComplete: true, completion: .idempotent)
        }
    }

    // MARK: - Decision (deny-by-default + step-up + audit)

    func decide(_ data: Data) async -> AccessEffect {
        guard let intent = try? JSONDecoder().decode(AccessIntent.self, from: data) else {
            return AccessEffect(allowed: false, reason: "Malformed intent", appliedPolicies: [])
        }
        return await decide(intent)
    }

    func decide(_ intent: AccessIntent) async -> AccessEffect {
        let policies = capabilities()[intent.agentId]?.policies ?? []
        var effect = engine.evaluate(policies, intent: intent)

        if let approvalId = effect.pendingApprovalId {
            let approved = await engine.requestApproval(approvalId, intent: intent)
            effect = AccessEffect(
                allowed: approved,
                reason: approved ? "Approved via step-up" : "Denied or timed out at step-up",
                appliedPolicies: effect.appliedPolicies)
        }
        audit.append(intent: intent, effect: effect)
        return effect
    }
}
