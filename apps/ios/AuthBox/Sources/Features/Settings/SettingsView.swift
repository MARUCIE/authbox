import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var showDeleteConfirm = false
    @State private var showProUpgrade = false
    @State private var faceIDEnabled = true
    @ObservedObject var proManager = ProManager.shared
    /// Drives the NavigationSplitView detail (iPad: sidebar+detail like Settings.app;
    /// iPhone compact: auto-collapses to a category drill-down).
    ///
    /// Default is nil so iPhone compact opens on the SIDEBAR (Pro banner + category
    /// list), not pushed straight into a detail. On iPad regular width we preselect
    /// .security in onAppear so the detail pane isn't empty — same hSizeClass guard
    /// pattern as Vault/Wallet's autoSelectFirstOnPad.
    @State private var selection: SettingsCategory?
    @Environment(\.horizontalSizeClass) private var hSizeClass

    enum SettingsCategory: Hashable {
        case security, sync, about
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                if !proManager.isPro {
                    Section {
                        Button {
                            showProUpgrade = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "crown.fill")
                                    .font(.title3)
                                    .foregroundStyle(.yellow)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Upgrade to Pro")
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text("MCP Gateway, unlimited API keys, sync")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("$29")
                                    .font(.headline)
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                }

                Section {
                    Label("Security", systemImage: "lock.shield.fill")
                        .tag(SettingsCategory.security)
                    Label("iCloud Sync", systemImage: "cloud.fill")
                        .tag(SettingsCategory.sync)
                    Label("About", systemImage: "info.circle.fill")
                        .tag(SettingsCategory.about)
                }

                Section {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("Delete Vault", systemImage: "trash")
                    }
                }
            }
            .navigationTitle("Settings")
            .onAppear { autoSelectOnPad() }
            .sheet(isPresented: $showProUpgrade) {
                ProUpgradeView()
            }
            .alert("Delete Vault?", isPresented: $showDeleteConfirm) {
                Button("Delete", role: .destructive) {
                    KeychainManager.deleteSeed()
                    appState.lockVault()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will remove all local data. You can restore from your seed phrase.")
            }
        } detail: {
            NavigationStack {
                switch selection {
                case .security: securityDetail
                case .sync: syncDetail
                case .about: aboutDetail
                case .none:
                    ContentUnavailableView(
                        "Settings",
                        systemImage: "gearshape.fill",
                        description: Text("Select a category to configure.")
                    )
                }
            }
        }
    }

    /// iPad (regular width): preselect Security so the detail pane shows content on
    /// launch (Settings.app convention). iPhone compact leaves selection nil so the
    /// sidebar — with the Pro banner and categories — is what the user sees first.
    private func autoSelectOnPad() {
        guard hSizeClass == .regular, selection == nil else { return }
        selection = .security
    }

    // MARK: - Detail panes

    private var securityDetail: some View {
        List {
            Section {
                Toggle(isOn: $faceIDEnabled) {
                    Label("Face ID", systemImage: "faceid")
                }
                NavigationLink {
                    Text("Change Passcode")
                } label: {
                    Label("Change Passcode", systemImage: "lock.rotation")
                }
                NavigationLink {
                    Text("Recovery phrase backup")
                } label: {
                    Label {
                        Text("Backup Seed Phrase")
                    } icon: {
                        Image(systemName: "key.fill")
                            .foregroundStyle(.purple)
                    }
                }
            } header: {
                Text("Security")
            }
        }
        .navigationTitle("Security")
    }

    private var syncDetail: some View {
        List {
            Section {
                Toggle(isOn: Binding(
                    get: { appState.isSyncEnabled },
                    set: { isOn in
                        // Multi-device sync is a Pro feature. A free user toggling
                        // it on hits the paywall and the engine stays off until they
                        // upgrade. canUseFeature is the single source of truth.
                        if isOn && !proManager.canUseFeature(.multiDeviceSync) {
                            showProUpgrade = true
                        } else {
                            appState.isSyncEnabled = isOn
                        }
                    }
                )) {
                    Label {
                        HStack(spacing: 6) {
                            Text("iCloud Sync")
                            if !proManager.isPro { ProLockBadge() }
                        }
                    } icon: {
                        Image(systemName: "cloud")
                    }
                }

                HStack {
                    Label {
                        Text("Status")
                    } icon: {
                        Image(systemName: appState.isSyncEnabled ? "cloud.fill" : "cloud")
                            .foregroundStyle(appState.isSyncEnabled ? .blue : .secondary)
                    }
                    Spacer()
                    Text(appState.isSyncEnabled ? "iCloud — end-to-end encrypted" : "Off")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Sync")
            } footer: {
                Text("Only AES-256-GCM ciphertext is stored in iCloud. Your seed phrase and vault key never leave this device.")
            }
        }
        .navigationTitle("iCloud Sync")
    }

    private var aboutDetail: some View {
        List {
            Section {
                HStack {
                    Text("Version")
                    Spacer()
                    Text("1.0.0")
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Label {
                        Text("Encryption")
                    } icon: {
                        Image(systemName: "lock.shield.fill")
                            .foregroundStyle(.blue)
                    }
                    Spacer()
                    Text("AES-256-GCM")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Label {
                        Text("Key Derivation")
                    } icon: {
                        Image(systemName: "shield.checkered")
                            .foregroundStyle(.blue)
                    }
                    Spacer()
                    Text("BIP-39 / HD")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                NavigationLink {
                    Text("Privacy Policy")
                } label: {
                    Label("Privacy Policy", systemImage: "hand.raised.fill")
                }
            } header: {
                Text("About")
            }
        }
        .navigationTitle("About")
    }
}
