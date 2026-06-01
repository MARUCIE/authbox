//
//  RootView.swift
//  Main window shell. P0 establishes the three-domain navigation structure
//  (Vault / Providers / Authorizations) and the locked/unlocked gate.
//  Feature screens are filled in P2-P4.
//

import SwiftUI

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

    var subtitle: String {
        switch self {
        case .vault: return "Passwords & secrets — seed-phrase vault"
        case .generator: return "Random & deterministic password generation"
        case .providers: return "70+ AI provider keys — .env import, health checks"
        case .authorizations: return "Agent grants, policies, audit — Touch ID gated"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var lockState: VaultSession
    @State private var selection: AppSection = .vault

    var body: some View {
        if lockState.isUnlocked {
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
        case .providers, .authorizations: PlaceholderDetail(section: section)
        }
    }
}

/// P0 locked screen. P1 replaces the button action with a Touch ID prompt.
struct LockedView: View {
    @EnvironmentObject private var lockState: VaultSession

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
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

/// P0 placeholder for each domain; replaced by real feature views in P2-P4.
struct PlaceholderDetail: View {
    let section: AppSection

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: section.systemImage)
                .font(.system(size: 44))
                .foregroundStyle(.tint)
            Text(section.rawValue)
                .font(.title.weight(.bold))
            Text(section.subtitle)
                .font(.callout)
                .foregroundStyle(.secondary)
            Text("Coming in the next phase")
                .font(.caption)
                .padding(.horizontal, 12).padding(.vertical, 5)
                .background(.quaternary, in: Capsule())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(section.rawValue)
    }
}
