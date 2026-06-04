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
        // SEC-002: persist the audit chain so it survives restarts. Fall back to
        // in-memory only if Application Support is unreachable.
        if let injected = audit {
            self.audit = injected
        } else if let url = AuditLog.defaultStoreURL() {
            self.audit = AuditLog(url: url)
        } else {
            self.audit = AuditLog()
        }
        self.biometric = biometric
        self.auditValid = self.audit.loadedIntegrityOK
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

    /// Grant an agent and return its bearer token. (SEC-001) The token is shown
    /// to the operator exactly once here — only its hash is stored. The agent
    /// process must present this token on every intent.
    @discardableResult
    func addCapability(name: String, allowedActions: [AgentAction], requireStepUp: Bool) -> String {
        addScopedCapability(name: name, allowedItemTypes: [],
                            allowedActions: allowedActions, requireStepUp: requireStepUp).token
    }

    /// Least-privilege grant: an agent scoped to specific credential types (item
    /// categories), with action permissions, an optional rate limit, and step-up.
    /// Used by one-click QuickConnect so an imported batch yields an agent that can
    /// reach ONLY those credentials — not the whole vault. Returns the bearer token
    /// (shown once; only its hash is stored). An empty `allowedItemTypes` adds no
    /// item-scope policy (broad within the other policies), matching `addCapability`.
    @discardableResult
    func addScopedCapability(name: String,
                             allowedItemTypes: [String],
                             allowedActions: [AgentAction],
                             maxRequests: Int? = nil,
                             windowSeconds: Int? = nil,
                             requireStepUp: Bool) -> IssuedAgentGrant {
        let agentId = "agent_\(name.lowercased().replacingOccurrences(of: " ", with: "_"))_\(capabilities.count)"
        var policies: [AgentPolicy] = []
        let stamp = Date(timeIntervalSince1970: 0)
        if !allowedItemTypes.isEmpty {
            // item_scope: deny-by-default narrows to exactly the imported categories.
            policies.append(AgentPolicy(
                id: "\(agentId)_scope", agentId: agentId, policyType: .item_scope,
                rules: PolicyRules(allowedItemTypes: allowedItemTypes),
                priority: 20, enabled: true, createdAt: stamp, updatedAt: stamp))
        }
        if !allowedActions.isEmpty {
            policies.append(AgentPolicy(
                id: "\(agentId)_action", agentId: agentId, policyType: .action_perm,
                rules: PolicyRules(allowedActions: allowedActions),
                priority: 10, enabled: true, createdAt: stamp, updatedAt: stamp))
        }
        if let maxRequests, let windowSeconds {
            policies.append(AgentPolicy(
                id: "\(agentId)_rate", agentId: agentId, policyType: .rate_limit,
                rules: PolicyRules(maxRequests: maxRequests, windowSeconds: windowSeconds),
                priority: 8, enabled: true, createdAt: stamp, updatedAt: stamp))
        }
        if requireStepUp {
            policies.append(AgentPolicy(
                id: "\(agentId)_stepup", agentId: agentId, policyType: .step_up,
                rules: PolicyRules(requireApproval: true),
                priority: 5, enabled: true, createdAt: stamp, updatedAt: stamp))
        }
        let token = AgentToken.generate()
        capabilities.append(AgentCapability(
            id: agentId, name: name, policies: policies, tokenHash: AgentToken.hash(token)))
        return IssuedAgentGrant(agentId: agentId, token: token)
    }

    /// One-click "import credentials + wire an AI agent + open the gateway".
    /// Chains the three already-authorized steps into a single operator action:
    ///   1. import  — classify `content` and store each credential encrypted.
    ///   2. grant   — register ONE agent scoped (least privilege) to exactly the
    ///                imported categories: read+use, rate-limited, step-up.
    ///   3. connect — ensure the loopback broker is running so the agent can present
    ///                its token immediately; without this it would hold a token with
    ///                nowhere to call (imported but not 打通).
    /// `importer` is injectable for tests; in the app it is built from the shared
    /// on-disk vault store so QuickConnect-imported keys are visible everywhere.
    @discardableResult
    func quickConnect(content: String, agentName: String, vaultKey: Data,
                      importer: ProviderImportService? = nil) throws -> QuickConnectService.Outcome {
        let imp = importer ?? ProviderImportService(
            vault: VaultService(store: (try? VaultStore()) ?? (try! VaultStore(inMemory: true))))
        let outcome = try QuickConnectService(importer: imp, registrar: self)
            .connect(content: content, agentName: agentName, vaultKey: vaultKey)
        if !brokerRunning { startBroker() }
        return outcome
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
    @EnvironmentObject private var session: VaultSession
    @State private var showingAdd = false
    @State private var showingQuickConnect = false
    @State private var issuedToken: String?
    @State private var quickConnectNote: String?

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
                Button { session.noteActivity(); showingQuickConnect = true } label: {
                    Label("Quick Connect", systemImage: "bolt.badge.automatic")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button { session.noteActivity(); showingAdd = true } label: { Label("Grant agent", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddGrantSheet { name, actions, stepUp in
                issuedToken = center.addCapability(name: name, allowedActions: actions, requireStepUp: stepUp)
            }
        }
        .sheet(isPresented: $showingQuickConnect) {
            QuickConnectSheet(hasVaultKey: session.hasVaultKey) { content, name in
                session.noteActivity()
                let outcome = session.withVaultKey { key -> Result<QuickConnectService.Outcome, Error> in
                    do { return .success(try center.quickConnect(content: content, agentName: name, vaultKey: key)) }
                    catch { return .failure(error) }
                }
                switch outcome {
                case .success(let o):
                    quickConnectNote = "Imported \(o.importedCount) credential\(o.importedCount == 1 ? "" : "s") · agent scoped to: \(o.scopedItemTypes.joined(separator: ", ")) · broker running on 127.0.0.1:\(String(AuthorizationBroker.port))"
                    issuedToken = o.token            // show the bearer token once
                case .failure(let e):
                    center.error = "Quick Connect failed: \(e)"
                case .none:
                    center.error = "Vault is locked — unlock to import credentials."
                }
            }
        }
        .alert("Agent token — copy now", isPresented: Binding(
            get: { issuedToken != nil },
            set: { if !$0 { issuedToken = nil } })) {
            Button("Copy") {
                if let t = issuedToken {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(t, forType: .string)
                }
                issuedToken = nil; quickConnectNote = nil
            }
            Button("Done", role: .cancel) { issuedToken = nil; quickConnectNote = nil }
        } message: {
            Text("\(quickConnectNote.map { $0 + "\n\n" } ?? "")This bearer token is shown only once. The agent must present it on every request; it is not stored in plaintext.\n\n\(issuedToken ?? "")")
        }
        .onAppear { center.refreshAudit() }
    }

    private var brokerCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Label(center.brokerRunning ? "Broker running" : "Broker stopped",
                      systemImage: center.brokerRunning ? "bolt.horizontal.circle.fill" : "bolt.horizontal.circle")
                    .font(.headline).foregroundStyle(center.brokerRunning ? .green : .secondary)
                // String(port) avoids LocalizedStringKey integer interpolation, which
                // applies the locale's grouping separator and renders 19876 as "19,876".
                Text("ws://127.0.0.1:\(String(AuthorizationBroker.port)) · loopback only")
                    .font(.caption).foregroundStyle(.secondary).monospaced()
            }
            Spacer()
            Button(center.brokerRunning ? "Stop" : "Start") {
                session.noteActivity()   // user activity re-arms idle auto-lock
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
                    Button("Deny") { session.noteActivity(); Task { await center.resolve(p, allow: false) } }
                        .buttonStyle(.bordered)
                    Button("Allow once") { session.noteActivity(); Task { await center.resolve(p, allow: true) } }
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

/// One-click "import credentials + wire an AI agent". The operator pastes (or picks)
/// a .env/JSON config; the sheet previews exactly which provider categories will be
/// imported and scoped, then a single Connect imports them encrypted, grants ONE
/// least-privilege agent scoped to those categories, and starts the loopback broker.
private struct QuickConnectSheet: View {
    @Environment(\.dismiss) private var dismiss
    let hasVaultKey: Bool
    var onConnect: (_ content: String, _ agentName: String) -> Void

    @State private var name = "AI Assistant"
    @State private var content = ""
    @State private var showImporter = false

    /// Live classification of the pasted config — shows scope before granting.
    private var preview: EnvImportResult? {
        content.isEmpty ? nil : EnvParser.parseAndClassify(content)
    }
    private var scopedCategories: [String] {
        guard let preview else { return [] }
        var seen = Set<String>(); var out: [String] = []
        for c in preview.classified where seen.insert(c.categoryId).inserted { out.append(c.categoryId) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Quick Connect an AI agent").font(.title2.weight(.semibold)).padding([.top, .horizontal])
            Text("Paste a .env / JSON config. Keys are auto-classified, imported encrypted into your vault, and one scoped agent is wired to reach exactly those categories — read + use, rate-limited, Touch ID step-up on every access. Nothing leaves this Mac.")
                .font(.caption).foregroundStyle(.secondary).padding(.horizontal).padding(.top, 2)

            Form {
                TextField("Agent name", text: $name)
                Section("Credentials") {
                    TextEditor(text: $content)
                        .font(.system(.callout, design: .monospaced))
                        .frame(height: 120)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
                    HStack {
                        Button("Choose .env file…") { showImporter = true }
                        if content.isEmpty == false { Button("Clear") { content = "" } }
                    }
                }
                if let preview, preview.classified.isEmpty == false {
                    Section("Will import \(preview.classified.count) · agent scoped to \(scopedCategories.count) categor\(scopedCategories.count == 1 ? "y" : "ies")") {
                        ForEach(preview.classified) { cred in
                            HStack {
                                Text(cred.providerName).font(.body.weight(.medium))
                                Text(cred.categoryName).font(.caption2)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(.tint.opacity(0.15), in: Capsule())
                                Spacer()
                                Text("\(cred.fields.count) field\(cred.fields.count == 1 ? "" : "s")")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .formStyle(.grouped)

            if hasVaultKey == false {
                Label("Unlock the vault to import credentials.", systemImage: "lock.fill")
                    .font(.caption).foregroundStyle(.orange).padding(.horizontal)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Connect") { onConnect(content, name); dismiss() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(name.isEmpty || scopedCategories.isEmpty || hasVaultKey == false)
            }
            .padding()
        }
        .frame(width: 480, height: 560)
        .fileImporter(isPresented: $showImporter,
                      allowedContentTypes: [.text, .plainText, .json, .data],
                      allowsMultipleSelection: false) { result in
            if case let .success(urls) = result, let url = urls.first {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                if let data = try? Data(contentsOf: url), let text = String(data: data, encoding: .utf8) {
                    content = text
                }
            }
        }
    }
}
