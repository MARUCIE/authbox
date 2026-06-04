//
//  AuthorizationsView.swift
//  P4 — the agent-authorization surface: start/stop the local broker, manage
//  agent grants (capabilities + policies), approve step-up consent with Touch ID,
//  and inspect the tamper-evident audit log.
//
//  No seeded/demo data — every agent and policy here is one the user added.
//

import SwiftUI

/// One credential category already present in the vault, with how many items it
/// holds — the unit of the "connect to what you already have" summary.
struct VaultCategorySummary: Identifiable, Equatable {
    let id: String
    let name: String
    let count: Int
}

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
    /// Restart-durable home for granted capabilities (token hashes + policies).
    /// nil ⇒ ephemeral (tests / Application Support unreachable).
    private let capabilityStore: CapabilityStore?
    private lazy var broker = AuthorizationBroker(
        engine: engine, audit: audit,
        capabilities: { [weak self] in
            Dictionary(uniqueKeysWithValues: (self?.capabilities ?? []).map { ($0.id, $0) })
        })

    init(engine: PolicyEngine? = nil,
         audit: AuditLog? = nil,
         biometric: BiometricAuthenticating = LABiometricAuth(),
         capabilityStore: CapabilityStore? = CapabilityStore.defaultStore()) {
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
        self.capabilityStore = capabilityStore
        // SEC-001 durability: reload previously granted agents so a wired agent
        // (its token hash + scoped policies) survives an app restart.
        self.capabilities = capabilityStore?.load() ?? []
        self.auditValid = self.audit.loadedIntegrityOK
        self.engine.onApprovalNeeded = { [weak self] approval in
            Task { @MainActor in self?.pending.append(approval) }
        }
    }

    /// Seal the current grant set to disk after any add/revoke so it survives a
    /// restart. No-op when ephemeral (tests).
    private func persistCapabilities() { capabilityStore?.save(capabilities) }

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
        persistCapabilities()
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

    /// Provider-credential categories already present in the on-disk vault.
    /// Reads metadata only (`VaultService.list()` needs no vault key), so the
    /// "connect to what you already have" path can ENUMERATE without a file and
    /// without unlocking — only revealing a secret later needs the key.
    func existingVaultSummary() -> [VaultCategorySummary] {
        guard let store = try? VaultStore() else { return [] }
        let items = (try? VaultService(store: store).list()) ?? []
        var order: [String] = []
        var counts: [String: Int] = [:]
        for it in items where it.providerId != nil {
            let cat = it.categoryId ?? "unknown"
            if counts[cat] == nil { order.append(cat) }
            counts[cat, default: 0] += 1
        }
        return order.map { id in
            VaultCategorySummary(id: id,
                                 name: CredentialCatalog.category(id)?.name ?? id,
                                 count: counts[id] ?? 0)
        }
    }

    /// The true one-click path: wire an agent to EVERY credential category already
    /// in the vault. No file to pick, no vault key — only a scoped grant + the
    /// broker. Returns nil when the vault holds no provider credentials yet.
    @discardableResult
    func quickConnectExisting(agentName: String) -> QuickConnectService.Outcome? {
        let summary = existingVaultSummary()
        guard !summary.isEmpty else { return nil }
        let types = summary.map(\.id)
        let grant = addScopedCapability(
            name: agentName, allowedItemTypes: types, allowedActions: [.read, .use],
            maxRequests: 60, windowSeconds: 3600, requireStepUp: true)
        if !brokerRunning { startBroker() }
        return QuickConnectService.Outcome(
            importedCount: summary.reduce(0) { $0 + $1.count },
            agentId: grant.agentId, token: grant.token, scopedItemTypes: types)
    }

    func revoke(_ capability: AgentCapability) {
        capabilities.removeAll { $0.id == capability.id }
        persistCapabilities()
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

    /// Surface a Quick Connect outcome: a one-line summary + the bearer token alert.
    private func present(_ o: QuickConnectService.Outcome, verb: String) {
        let cats = o.scopedItemTypes.isEmpty ? "—" : o.scopedItemTypes.joined(separator: ", ")
        quickConnectNote = "\(verb) \(o.importedCount) credential\(o.importedCount == 1 ? "" : "s") · agent scoped to: \(cats) · broker running on 127.0.0.1:\(String(AuthorizationBroker.port))"
        issuedToken = o.token
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                quickConnectCard
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
            QuickConnectSheet(
                existing: center.existingVaultSummary(),
                hasVaultKey: session.hasVaultKey,
                onConnectExisting: { name in
                    session.noteActivity()
                    if let o = center.quickConnectExisting(agentName: name) {
                        present(o, verb: "Wired")
                    } else {
                        center.error = "No credentials in your vault yet — import some first."
                    }
                },
                onImport: { content, name in
                    session.noteActivity()
                    let outcome = session.withVaultKey { key -> Result<QuickConnectService.Outcome, Error> in
                        do { return .success(try center.quickConnect(content: content, agentName: name, vaultKey: key)) }
                        catch { return .failure(error) }
                    }
                    switch outcome {
                    case .success(let o): present(o, verb: "Imported")
                    case .failure(let e): center.error = "Quick Connect failed: \(e)"
                    case .none: center.error = "Vault is locked — unlock to import credentials."
                    }
                })
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

    /// Headline call-to-action: the one-click "import keys + wire an AI agent" flow.
    /// Kept as a prominent card (not just a toolbar icon) because it is the primary
    /// action of this screen.
    private var quickConnectCard: some View {
        HStack(spacing: 14) {
            Image(systemName: "bolt.badge.automatic.fill")
                .font(.system(size: 28))
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 2) {
                Text("Quick Connect an AI agent").font(.headline)
                Text("Import all your API keys in one click and wire a scoped agent that can use them — least privilege, Touch ID step-up. Nothing leaves this Mac.")
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button {
                session.noteActivity(); showingQuickConnect = true
            } label: {
                Label("Quick Connect", systemImage: "bolt.fill").padding(.horizontal, 4)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding(16)
        .background(.tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.tint.opacity(0.25)))
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

/// One-click "wire an AI agent to your credentials". Two paths, primary first:
///   • If the vault already holds credentials (the common case), the default is a
///     single Connect that scopes an agent to ALL of them — no file, no typing.
///   • Otherwise (or to add new keys), an expandable importer pastes/picks a
///     .env / JSON config, classifies it, and imports it encrypted before wiring.
/// Either way the agent is least-privilege: read + use, rate-limited, Touch ID
/// step-up on every access. Nothing leaves this Mac.
struct QuickConnectSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: [VaultCategorySummary]
    let hasVaultKey: Bool
    var onConnectExisting: (_ agentName: String) -> Void
    var onImport: (_ content: String, _ agentName: String) -> Void

    @State private var name = "AI Assistant"
    @State private var content = ""
    @State private var showImporter = false
    /// Expand the "import new keys" path. Auto-expanded when the vault is empty,
    /// since then importing is the only way forward.
    @State private var importing = false

    private var existingCount: Int { existing.reduce(0) { $0 + $1.count } }

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
        VStack(alignment: .leading, spacing: 16) {
            header
            if existing.isEmpty || importing {
                importSection
            } else {
                existingSection
            }
            footer
        }
        .padding(20)
        .frame(width: 500)          // height hugs content — no fixed-height void
        .onAppear { importing = existing.isEmpty }
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

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "bolt.badge.automatic.fill").font(.system(size: 26)).foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 2) {
                Text("Quick Connect an AI agent").font(.title2.weight(.semibold))
                Text("Give one AI agent least-privilege access to your keys — Touch ID on every use. Nothing leaves this Mac.")
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Primary path: connect to what's already in the vault

    private var existingSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text("AGENT NAME").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                TextField("Agent name", text: $name).textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 9) {
                Label {
                    Text("\(existingCount) credential\(existingCount == 1 ? "" : "s") in your vault · \(existing.count) categor\(existing.count == 1 ? "y" : "ies")")
                        .font(.subheadline.weight(.semibold))
                } icon: {
                    Image(systemName: "key.fill").foregroundStyle(.tint)
                }
                FlowChips(items: existing.map { "\($0.name) (\($0.count))" })
                Label {
                    Text("This agent gets read + use on all of them — rate-limited, with Touch ID approval on every access.")
                        .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "checkmark.shield.fill").foregroundStyle(.green)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(.tint.opacity(0.2)))

            Button { importing = true } label: {
                Label("Import new keys from a .env file instead", systemImage: "plus.circle")
                    .font(.callout)
            }
            .buttonStyle(.link)
        }
    }

    // MARK: - Secondary path: import new keys, then wire

    private var importSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 5) {
                Text("AGENT NAME").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                TextField("Agent name", text: $name).textFieldStyle(.roundedBorder)
            }

            Text(existing.isEmpty
                 ? "Your vault is empty. Paste a .env / JSON config below, or choose a file — each line like OPENAI_API_KEY=sk-… is auto-classified and imported encrypted."
                 : "Paste a .env / JSON config to import new keys; they are auto-classified and imported encrypted before the agent is wired.")
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)

            TextEditor(text: $content)
                .font(.system(.callout, design: .monospaced))
                .frame(height: 130)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
                .overlay(alignment: .topLeading) {
                    if content.isEmpty {
                        Text("OPENAI_API_KEY=sk-…\nANTHROPIC_API_KEY=sk-ant-…")
                            .font(.system(.callout, design: .monospaced)).foregroundStyle(.tertiary)
                            .padding(.horizontal, 5).padding(.vertical, 8).allowsHitTesting(false)
                    }
                }

            HStack {
                Button { showImporter = true } label: { Label("Choose .env file…", systemImage: "doc.badge.plus") }
                if content.isEmpty == false { Button("Clear") { content = "" } }
                Spacer()
                if existing.isEmpty == false {
                    Button { importing = false; content = "" } label: { Label("Back", systemImage: "chevron.left") }
                        .buttonStyle(.link)
                }
            }

            if let preview, preview.classified.isEmpty == false {
                Text("Will import \(preview.classified.count) · scope: \(scopedCategories.joined(separator: ", "))")
                    .font(.caption.weight(.medium)).foregroundStyle(.tint)
                FlowChips(items: preview.classified.map(\.providerName))
            }
            if hasVaultKey == false {
                Label("Unlock the vault to import new credentials.", systemImage: "lock.fill")
                    .font(.caption).foregroundStyle(.orange)
            }
        }
    }

    private var footer: some View {
        HStack {
            Spacer()
            Button("Cancel") { dismiss() }
            if existing.isEmpty || importing {
                Button("Import & Connect") { onImport(content, name); dismiss() }
                    .keyboardShortcut(.defaultAction).buttonStyle(.borderedProminent)
                    .disabled(name.isEmpty || scopedCategories.isEmpty || hasVaultKey == false)
            } else {
                Button("Connect") { onConnectExisting(name); dismiss() }
                    .keyboardShortcut(.defaultAction).buttonStyle(.borderedProminent)
                    .disabled(name.isEmpty)
            }
        }
    }
}

/// A simple wrapping row of pill chips — used to preview credential categories or
/// providers without a fixed column count.
private struct FlowChips: View {
    let items: [String]
    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(items, id: \.self) { item in
                Text(item).font(.caption.weight(.medium))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(.tint.opacity(0.15), in: Capsule())
                    .foregroundStyle(.tint)
            }
        }
    }
}

/// Minimal flow layout (left-to-right wrap) — SwiftUI Layout, no third-party dep.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxWidth, x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}
