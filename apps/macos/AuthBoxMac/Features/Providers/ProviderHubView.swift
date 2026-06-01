//
//  ProviderHubView.swift
//  P3 — AI provider hub: paste/drop a .env, preview auto-classified providers,
//  import them encrypted into the vault, and one-click verify each key against
//  its provider's own endpoint.
//

import SwiftUI

@MainActor
final class ProviderHubViewModel: ObservableObject {
    @Published var items: [VaultItem] = []
    @Published var preview: EnvImportResult?
    @Published var health: [UUID: HealthCheckResult] = [:]
    @Published var error: String?

    private let vault: VaultService
    private let importer: ProviderImportService

    init(vault: VaultService? = nil) {
        let v: VaultService
        if let vault { v = vault }
        else {
            let store = (try? VaultStore()) ?? (try! VaultStore(inMemory: true))
            v = VaultService(store: store)
        }
        self.vault = v
        self.importer = ProviderImportService(vault: v)
        reload()
    }

    func reload() {
        items = ((try? vault.list()) ?? []).filter { $0.providerId != nil }
    }

    func parse(_ text: String) {
        preview = text.isEmpty ? nil : EnvParser.parseAndClassify(text)
    }

    func runImport(vaultKey: Data) {
        guard let preview else { return }
        do { try importer.importCredentials(preview, vaultKey: vaultKey); self.preview = nil; reload() }
        catch { self.error = "\(error)" }
    }

    /// Synchronously decrypt one item under a borrowed vault key. Kept separate
    /// from `checkHealth` so the key borrow (SEC-003) stays synchronous and never
    /// has to span the async network call.
    func reveal(_ item: VaultItem, vaultKey: Data) -> VaultSecret? {
        try? vault.reveal(item.id, vaultKey: vaultKey)
    }

    /// Probe the provider with an already-revealed secret. The vault key never
    /// reaches this async context — only the decrypted fields, which must travel
    /// to the provider anyway.
    func checkHealth(_ item: VaultItem, secret: VaultSecret) async {
        guard let pid = item.providerId, CredentialHealth.hasHealthCheck(pid) else { return }
        let fields = secret.fields ?? ["api_key": secret.secret]
        health[item.id] = await CredentialHealth.check(providerId: pid, fields: fields)
    }

    /// Existing provider items grouped by category, in catalog sort order.
    var grouped: [(category: CredentialCategory, items: [VaultItem])] {
        let byCat = Dictionary(grouping: items) { $0.categoryId ?? "unknown" }
        return CredentialCatalog.categories
            .sorted { $0.sortOrder < $1.sortOrder }
            .compactMap { cat in
                let its = byCat[cat.id] ?? []
                return its.isEmpty ? nil : (cat, its)
            }
    }
}

struct ProviderHubView: View {
    @EnvironmentObject private var session: VaultSession
    @StateObject private var vm = ProviderHubViewModel()
    @State private var envText = ""
    @State private var showImporter = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                importCard
                if let preview = vm.preview { previewCard(preview) }
                existingSection
            }
            .padding(20)
        }
        .navigationTitle("AI Providers")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showImporter = true } label: { Label("Import .env file", systemImage: "doc.badge.plus") }
            }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.text, .plainText, .json, .data],
                      allowsMultipleSelection: false) { result in
            if case let .success(urls) = result, let url = urls.first {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                if let data = try? Data(contentsOf: url), let text = String(data: data, encoding: .utf8) {
                    envText = text; vm.parse(text)
                }
            }
        }
    }

    private var importCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Import from .env").font(.headline)
            Text("Paste a .env or JSON config. Keys are auto-classified to providers and encrypted into your vault. Nothing leaves this Mac.")
                .font(.caption).foregroundStyle(.secondary)
            TextEditor(text: $envText)
                .font(.system(.callout, design: .monospaced))
                .frame(height: 120)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
            HStack {
                Button("Parse & preview") { vm.parse(envText) }
                    .disabled(envText.isEmpty)
                Button("Clear") { envText = ""; vm.parse("") }
            }
        }
        .padding(16)
        .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 10))
    }

    private func previewCard(_ preview: EnvImportResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Preview").font(.headline)
                Spacer()
                Text("\(preview.stats.classifiedVars) classified · \(preview.stats.unclassifiedVars) unmatched")
                    .font(.caption).foregroundStyle(.secondary)
            }
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
            Button {
                session.withVaultKey { vm.runImport(vaultKey: $0) }
            } label: {
                Label("Import \(preview.classified.count) credential\(preview.classified.count == 1 ? "" : "s") to vault",
                      systemImage: "lock.badge.clock")
            }
            .buttonStyle(.borderedProminent)
            .disabled(preview.classified.isEmpty || !session.hasVaultKey)
        }
        .padding(16)
        .background(.tint.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private var existingSection: some View {
        if vm.items.isEmpty {
            ContentUnavailableView("No provider keys yet", systemImage: "cpu",
                                   description: Text("Import a .env above to populate your provider hub."))
                .padding(.top, 12)
        } else {
            ForEach(vm.grouped, id: \.category.id) { group in
                VStack(alignment: .leading, spacing: 6) {
                    Text(group.category.name.uppercased())
                        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(group.items) { item in providerRow(item) }
                }
            }
        }
    }

    private func providerRow(_ item: VaultItem) -> some View {
        let result = vm.health[item.id]
        return HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).font(.body.weight(.medium))
                if let r = result {
                    Text(r.message).font(.caption2)
                        .foregroundStyle(color(for: r.status))
                }
            }
            Spacer()
            if let pid = item.providerId, CredentialHealth.hasHealthCheck(pid) {
                Button {
                    // Borrow the key only for the synchronous decrypt (SEC-003);
                    // the async probe runs on the revealed secret, key already zeroed.
                    if let secret = session.withVaultKey({ vm.reveal(item, vaultKey: $0) }) ?? nil {
                        Task { await vm.checkHealth(item, secret: secret) }
                    }
                } label: {
                    Label(result == nil ? "Verify" : result!.status.rawValue,
                          systemImage: icon(for: result?.status))
                        .labelStyle(.titleAndIcon)
                }
                .buttonStyle(.bordered).controlSize(.small)
                .tint(color(for: result?.status))
            }
        }
        .padding(.vertical, 6).padding(.horizontal, 10)
        .background(.quaternary.opacity(0.2), in: RoundedRectangle(cornerRadius: 8))
    }

    private func color(for status: HealthStatus?) -> Color {
        switch status {
        case .valid: return .green
        case .invalid, .expired: return .red
        case .quota_exceeded: return .orange
        case .error: return .yellow
        case .unchecked, nil: return .secondary
        }
    }

    private func icon(for status: HealthStatus?) -> String {
        switch status {
        case .valid: return "checkmark.seal.fill"
        case .invalid, .expired: return "xmark.seal.fill"
        case .quota_exceeded: return "exclamationmark.triangle.fill"
        case .error: return "exclamationmark.circle"
        case .unchecked, nil: return "arrow.clockwise"
        }
    }
}
