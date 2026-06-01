//
//  AuthorizationsView.swift
//  P4 — the agent-authorization surface: start/stop the local broker, manage
//  agent grants (capabilities + policies), approve step-up consent with Touch ID,
//  and inspect the tamper-evident audit log.
//
//  No seeded/demo data — every agent and policy here is one the user added.
//

import SwiftUI

@MainActor
final class AuthorizationCenter: ObservableObject {
    @Published var capabilities: [AgentCapability] = []
    @Published var pending: [PendingApproval] = []
    @Published var facts: [AuditFact] = []
    @Published var brokerRunning = false
    @Published var auditValid = true
    @Published var error: String?

    let engine: PolicyEngine
    let audit: AuditLog
    private let biometric: BiometricAuthenticating
    private lazy var broker = AuthorizationBroker(
        engine: engine, audit: audit,
        capabilities: { [weak self] in
            Dictionary(uniqueKeysWithValues: (self?.capabilities ?? []).map { ($0.id, $0) })
        })

    init(engine: PolicyEngine? = nil,
         audit: AuditLog? = nil,
         biometric: BiometricAuthenticating = LABiometricAuth()) {
        // PolicyEngine/AuditLog are @MainActor; build them in this isolated init
        // body rather than as default args (which evaluate nonisolated).
        self.engine = engine ?? PolicyEngine()
        self.audit = audit ?? AuditLog()
        self.biometric = biometric
        self.engine.onApprovalNeeded = { [weak self] approval in
            Task { @MainActor in self?.pending.append(approval) }
        }
    }

    func startBroker() {
        do { try broker.start(); brokerRunning = broker.isRunning }
        catch { self.error = "Broker failed: \(error)" }
    }

    func stopBroker() { broker.stop(); brokerRunning = false }

    /// Approve/deny a pending step-up. "Allow" is gated by Touch ID — the consent
    /// only resolves true after a successful biometric check.
    func resolve(_ approval: PendingApproval, allow: Bool) async {
        var granted = false
        if allow {
            if case .success = await biometric.authenticate(reason: "Approve agent access: \(approval.action.rawValue)") {
                granted = true
            }
        }
        engine.resolveApproval(approval.id, approved: granted)
        pending.removeAll { $0.id == approval.id }
        refreshAudit()
    }

    func addCapability(name: String, allowedActions: [AgentAction], requireStepUp: Bool) {
        let agentId = "agent_\(name.lowercased().replacingOccurrences(of: " ", with: "_"))_\(capabilities.count)"
        var policies: [AgentPolicy] = []
        let stamp = Date(timeIntervalSince1970: 0)
        if !allowedActions.isEmpty {
            policies.append(AgentPolicy(
                id: "\(agentId)_action", agentId: agentId, policyType: .action_perm,
                rules: PolicyRules(allowedActions: allowedActions),
                priority: 10, enabled: true, createdAt: stamp, updatedAt: stamp))
        }
        if requireStepUp {
            policies.append(AgentPolicy(
                id: "\(agentId)_stepup", agentId: agentId, policyType: .step_up,
                rules: PolicyRules(requireApproval: true),
                priority: 5, enabled: true, createdAt: stamp, updatedAt: stamp))
        }
        capabilities.append(AgentCapability(id: agentId, name: name, policies: policies))
    }

    func revoke(_ capability: AgentCapability) {
        capabilities.removeAll { $0.id == capability.id }
    }

    func refreshAudit() {
        facts = audit.facts.sorted { $0.seq > $1.seq }
        auditValid = audit.verify()
    }
}

struct AuthorizationsView: View {
    @StateObject private var center = AuthorizationCenter()
    @State private var showingAdd = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                brokerCard
                if !center.pending.isEmpty { consentSection }
                grantsSection
                auditSection
            }
            .padding(20)
        }
        .navigationTitle("Authorizations")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingAdd = true } label: { Label("Grant agent", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddGrantSheet { name, actions, stepUp in
                center.addCapability(name: name, allowedActions: actions, requireStepUp: stepUp)
            }
        }
        .onAppear { center.refreshAudit() }
    }

    private var brokerCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Label(center.brokerRunning ? "Broker running" : "Broker stopped",
                      systemImage: center.brokerRunning ? "bolt.horizontal.circle.fill" : "bolt.horizontal.circle")
                    .font(.headline).foregroundStyle(center.brokerRunning ? .green : .secondary)
                Text("ws://127.0.0.1:\(AuthorizationBroker.port) · loopback only")
                    .font(.caption).foregroundStyle(.secondary).monospaced()
            }
            Spacer()
            Button(center.brokerRunning ? "Stop" : "Start") {
                center.brokerRunning ? center.stopBroker() : center.startBroker()
            }
            .buttonStyle(.borderedProminent).tint(center.brokerRunning ? .red : .green)
        }
        .padding(16)
        .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .bottom) {
            if let e = center.error { Text(e).font(.caption).foregroundStyle(.red).padding(4) }
        }
    }

    private var consentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Pending consent").font(.headline)
            ForEach(center.pending) { p in
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(p.agentId) → \(p.action.rawValue)").font(.body.weight(.medium))
                        Text(p.itemId.map { "Item: \($0)" } ?? p.reason)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Deny") { Task { await center.resolve(p, allow: false) } }
                        .buttonStyle(.bordered)
                    Button("Allow once") { Task { await center.resolve(p, allow: true) } }
                        .buttonStyle(.borderedProminent)
                }
                .padding(10)
                .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    @ViewBuilder
    private var grantsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Agent grants").font(.headline)
            if center.capabilities.isEmpty {
                Text("No agents granted. Use “Grant agent” to authorize one.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            ForEach(center.capabilities) { cap in
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(cap.name).font(.body.weight(.medium))
                        Text(cap.policies.map { $0.policyType.rawValue }.joined(separator: " · "))
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(role: .destructive) { center.revoke(cap) } label: {
                        Image(systemName: "trash")
                    }.buttonStyle(.borderless)
                }
                .padding(10)
                .background(.quaternary.opacity(0.2), in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var auditSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Audit log").font(.headline)
                Spacer()
                Label(center.auditValid ? "chain intact" : "TAMPERED",
                      systemImage: center.auditValid ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                    .font(.caption).foregroundStyle(center.auditValid ? .green : .red)
                Button { center.refreshAudit() } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.borderless)
            }
            if center.facts.isEmpty {
                Text("No decisions recorded yet.").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(center.facts.prefix(50)) { f in
                HStack(spacing: 8) {
                    Image(systemName: f.allowed ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(f.allowed ? .green : .red)
                    VStack(alignment: .leading, spacing: 0) {
                        Text("#\(f.seq) \(f.agentId) → \(f.action)").font(.caption.weight(.medium))
                        Text(f.reason).font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(f.hash.prefix(8)).font(.caption2.monospaced()).foregroundStyle(.tertiary)
                }
                .padding(.vertical, 4).padding(.horizontal, 8)
            }
        }
    }
}

private struct AddGrantSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: (_ name: String, _ actions: [AgentAction], _ stepUp: Bool) -> Void

    @State private var name = ""
    @State private var allowRead = true
    @State private var allowUse = false
    @State private var allowProxy = false
    @State private var requireStepUp = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Grant an agent").font(.title2.weight(.semibold)).padding()
            Form {
                TextField("Agent name", text: $name)
                Section("Allowed actions") {
                    Toggle("read", isOn: $allowRead)
                    Toggle("use", isOn: $allowUse)
                    Toggle("proxy", isOn: $allowProxy)
                }
                Section {
                    Toggle("Require Touch ID step-up for each access", isOn: $requireStepUp)
                }
            }
            .formStyle(.grouped)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Grant") {
                    var actions: [AgentAction] = []
                    if allowRead { actions.append(.read) }
                    if allowUse { actions.append(.use) }
                    if allowProxy { actions.append(.proxy) }
                    onSave(name, actions, requireStepUp)
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(name.isEmpty)
            }
            .padding()
        }
        .frame(width: 440, height: 420)
    }
}
