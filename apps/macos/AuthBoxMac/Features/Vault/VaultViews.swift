//
//  VaultViews.swift
//  P2 — vault UI: list + add + detail (reveal-on-demand). The vault key comes
//  from the unlocked VaultSession; the secret is decrypted only when revealed.
//

import SwiftUI

@MainActor
final class VaultViewModel: ObservableObject {
    @Published var items: [VaultItem] = []
    @Published var error: String?
    let service: VaultService

    init(service: VaultService? = nil) {
        if let service {
            self.service = service
        } else {
            do { self.service = VaultService(store: try VaultStore()) }
            catch {
                // Fall back to an in-memory store so the app stays usable; surface it.
                self.service = VaultService(store: try! VaultStore(inMemory: true))
                self.error = "Persistent store unavailable: \(error)"
            }
        }
        reload()
    }

    func reload() { items = (try? service.list()) ?? [] }

    func add(title: String, username: String, url: String, secret: VaultSecret, vaultKey: Data) {
        do { try service.add(title: title, username: username, urlString: url,
                             secret: secret, vaultKey: vaultKey); reload() }
        catch { self.error = "\(error)" }
    }

    func reveal(_ id: UUID, vaultKey: Data) -> VaultSecret? {
        do { return try service.reveal(id, vaultKey: vaultKey) }
        catch { self.error = "\(error)"; return nil }
    }

    func delete(_ id: UUID) {
        do { try service.delete(id); reload() } catch { self.error = "\(error)" }
    }
}

struct VaultListView: View {
    @EnvironmentObject private var session: VaultSession
    @StateObject private var vm = VaultViewModel()
    @State private var showingAdd = false
    @State private var selection: VaultItem.ID?

    var body: some View {
        List(selection: $selection) {
            if vm.items.isEmpty {
                ContentUnavailableView("No items yet", systemImage: "key",
                                       description: Text("Add a password or API key to get started."))
            }
            ForEach(vm.items) { item in
                NavigationLink(value: item.id) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title).font(.body.weight(.medium))
                        if !item.username.isEmpty {
                            Text(item.username).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Vault")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingAdd = true } label: { Label("Add", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddItemSheet { title, username, url, secret in
                session.withVaultKey { key in
                    vm.add(title: title, username: username, url: url, secret: secret, vaultKey: key)
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let err = vm.error {
                Text(err).font(.caption).padding(8).background(.red.opacity(0.15), in: Capsule())
            }
        }
        .navigationDestination(for: VaultItem.ID.self) { id in
            if let item = vm.items.first(where: { $0.id == id }) {
                ItemDetailView(item: item, vm: vm)
            }
        }
    }
}

struct AddItemSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: (_ title: String, _ username: String, _ url: String, _ secret: VaultSecret) -> Void

    @State private var title = ""
    @State private var username = ""
    @State private var url = ""
    @State private var secret = ""
    @State private var notes = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("New item").font(.title2.weight(.semibold)).padding()
            Form {
                TextField("Title", text: $title)
                TextField("Username / email", text: $username)
                TextField("URL", text: $url)
                HStack {
                    SecureField("Password / secret", text: $secret)
                    Button {
                        secret = PasswordGenerator.random()
                    } label: { Image(systemName: "dice") }
                    .help("Generate a random password")
                }
                TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...4)
            }
            .formStyle(.grouped)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") {
                    onSave(title, username, url, VaultSecret(secret: secret, notes: notes))
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(title.isEmpty || secret.isEmpty)
            }
            .padding()
        }
        .frame(width: 460, height: 380)
    }
}

struct ItemDetailView: View {
    let item: VaultItem
    @ObservedObject var vm: VaultViewModel
    @EnvironmentObject private var session: VaultSession
    @Environment(\.dismiss) private var dismiss
    @State private var revealed: VaultSecret?

    var body: some View {
        Form {
            LabeledContent("Title", value: item.title)
            if !item.username.isEmpty { LabeledContent("Username", value: item.username) }
            if !item.urlString.isEmpty { LabeledContent("URL", value: item.urlString) }
            Section("Secret") {
                if let s = revealed {
                    LabeledContent("Password") {
                        HStack {
                            Text(s.secret).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                            Button { copy(s.secret) } label: { Image(systemName: "doc.on.doc") }
                        }
                    }
                    if !s.notes.isEmpty { LabeledContent("Notes", value: s.notes) }
                    Button("Hide") { revealed = nil }
                } else {
                    Button {
                        revealed = session.withVaultKey { vm.reveal(item.id, vaultKey: $0) } ?? nil
                    } label: { Label("Reveal with vault key", systemImage: "eye") }
                }
            }
            Section {
                Button(role: .destructive) {
                    vm.delete(item.id)
                    dismiss()   // pop back to the list; this destination's item is now gone
                } label: { Label("Delete", systemImage: "trash") }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(item.title)
        .onDisappear { revealed = nil }   // never keep plaintext on screen after leaving
    }

    private func copy(_ s: String) {
        #if canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(s, forType: .string)
        #endif
    }
}
