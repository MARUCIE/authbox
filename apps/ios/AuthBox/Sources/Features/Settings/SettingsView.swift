import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var showDeleteConfirm = false
    @State private var showProUpgrade = false
    @State private var faceIDEnabled = true
    @ObservedObject var proManager = ProManager.shared

    var body: some View {
        NavigationStack {
            List {
                // Pro upgrade banner
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

                // Security
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

                // Sync
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

                // About
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

                // Danger zone
                Section {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        HStack {
                            Spacer()
                            Label("Delete Vault", systemImage: "trash")
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Settings")
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
        }
    }
}
