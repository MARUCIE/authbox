//
//  RootView.swift
//  Main window shell. P0 establishes the three-domain navigation structure
//  (Vault / Providers / Authorizations) and the locked/unlocked gate.
//  Feature screens are filled in P2-P4.
//

import SwiftUI
import AuthBoxCrypto

/// The fused domains, surfaced as sidebar sections.
enum AppSection: String, CaseIterable, Identifiable {
    case vault = "Vault"
    case generator = "Generator"
    case providers = "AI Providers"
    case authorizations = "Authorizations"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .vault: return "key.fill"
        case .generator: return "dice.fill"
        case .providers: return "cpu"
        case .authorizations: return "person.badge.shield.checkmark"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var lockState: VaultSession
    @State private var selection: AppSection = .vault

    var body: some View {
        // Both gates: the pre-onboarding biometric branch can set isUnlocked
        // with NO master key, and the full app would then silently drop every
        // save (withVaultKey returns nil). Unprovisioned always onboards.
        if lockState.isUnlocked && lockState.isProvisioned {
            NavigationSplitView {
                List(AppSection.allCases, selection: $selection) { section in
                    Label(section.rawValue, systemImage: section.systemImage)
                        .tag(section)
                }
                .navigationSplitViewColumnWidth(min: 200, ideal: 220)
                .safeAreaInset(edge: .bottom) {
                    Button { lockState.lock() } label: {
                        Label("Lock", systemImage: "lock.fill").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered).padding(8)
                }
            } detail: {
                NavigationStack { detailView(for: selection) }
            }
        } else if lockState.isProvisioned {
            LockedView()
        } else {
            OnboardingView()
        }
    }

    /// Routes each sidebar section to its real feature view. The vault section
    /// embeds its own master-detail stack via VaultListView's navigationDestination.
    @ViewBuilder
    private func detailView(for section: AppSection) -> some View {
        switch section {
        case .vault:          VaultListView()
        case .generator:      GeneratorView()
        case .providers:      ProviderHubView()
        case .authorizations: AuthorizationsView()
        }
    }
}

/// P0 locked screen. P1 replaces the button action with a Touch ID prompt.
struct LockedView: View {
    @EnvironmentObject private var lockState: VaultSession
    @State private var showRestore = false
    @State private var restorePhrase = ""
    @State private var restoreError: String?

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("Auth Box is locked")
                .font(.title2.weight(.semibold))
            Text("Unlock with Touch ID to access your vault, providers, and agent authorizations.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
            Button {
                lockState.unlock()
            } label: {
                Label("Unlock", systemImage: "touchid")
                    .frame(minWidth: 160)
            }
            .controlSize(.large)
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)

            if let err = lockState.lastError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: 360)
            }

            // Escape hatch for a Secure Enclave key invalidated by biometric
            // re-enrollment (.biometryCurrentSet): without this, a user
            // holding the correct 24 words had NO way back into the app —
            // isProvisioned stays true, so onboarding is unreachable.
            Button("Restore from recovery phrase…") { showRestore = true }
                .buttonStyle(.link)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
        .sheet(isPresented: $showRestore) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Restore from recovery phrase")
                    .font(.headline)
                Text("Re-provisions the vault key from your 24-word phrase (e.g. after Touch ID re-enrollment invalidated the Secure Enclave key). Your encrypted items are untouched.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                TextEditor(text: $restorePhrase)
                    .font(.system(.body, design: .monospaced))
                    .frame(height: 100)
                    .border(.quaternary)
                if let restoreError {
                    Text(restoreError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                HStack {
                    Spacer()
                    Button("Cancel") {
                        restorePhrase = ""
                        restoreError = nil
                        showRestore = false
                    }
                    Button("Restore") {
                        let phrase = restorePhrase.trimmingCharacters(in: .whitespacesAndNewlines)
                        // Validate BEFORE resetVault: clearing the wrapped key
                        // first would flip isProvisioned and tear this sheet
                        // down into onboarding on a typo'd phrase — the error
                        // below would never render.
                        guard Seed.validateMnemonic(phrase) else {
                            restoreError = "Invalid recovery phrase. Check spelling and word order."
                            return
                        }
                        do {
                            try lockState.resetVault()
                            try lockState.provisionAndUnlock(mnemonic: phrase)
                            restorePhrase = ""
                            restoreError = nil
                            showRestore = false
                        } catch {
                            restoreError = "Restore failed: \(error.localizedDescription)"
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(restorePhrase.split(separator: " ").count < 12)
                }
            }
            .padding(20)
            .frame(width: 460)
        }
    }
}
