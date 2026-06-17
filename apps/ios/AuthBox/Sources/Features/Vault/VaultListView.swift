import SwiftUI

struct VaultListView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var showAddItem = false
    @State private var showImport = false
    @State private var selectedTab: Tab = .passwords
    /// Drives the NavigationSplitView detail column (iPad: side-by-side; iPhone: push).
    @State private var selectedItemID: UUID?
    @Environment(\.horizontalSizeClass) private var hSizeClass

    enum Tab {
        case passwords, generator, wallet, settings
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            passwordsTab
                .tabItem {
                    Label("Vault", systemImage: "key.fill")
                }
                .tag(Tab.passwords)

            GeneratorView()
                .tabItem {
                    Label("Generator", systemImage: "wand.and.stars")
                }
                .tag(Tab.generator)

            WalletView()
                .tabItem {
                    Label("Wallet", systemImage: "bitcoinsign.circle.fill")
                }
                .tag(Tab.wallet)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(Tab.settings)
        }
        .onAppear { applyDemoTabSeamIfPresent() }
    }

    /// DEBUG-only no-tap seam: lets a `simctl launch --ipad-demo-tab <tab>` preselect a
    /// tab so visual-acceptance captures of Wallet/Settings need no UI tapping.
    private func applyDemoTabSeamIfPresent() {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "--ipad-demo-tab"), i + 1 < args.count else { return }
        switch args[i + 1] {
        case "generator": selectedTab = .generator
        case "wallet": selectedTab = .wallet
        case "settings": selectedTab = .settings
        default: selectedTab = .passwords
        }
        #endif
    }

    // MARK: - Passwords Tab (iPad-adaptive master/detail; collapses to a push stack on iPhone)
    //
    // WP-021 B-idiom translation: the credential List is the master column and the
    // selected item drives the detail column. On iPad regular width SwiftUI shows both
    // side by side; under horizontalSizeClass == .compact (iPhone) NavigationSplitView
    // auto-collapses so tapping a row pushes the detail — today's iPhone flow, zero loss.

    private var passwordsTab: some View {
        NavigationSplitView {
            List(selection: $selectedItemID) {
                if filteredItems.isEmpty && searchText.isEmpty {
                    emptyState
                } else if filteredItems.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                } else {
                    ForEach(groupedSections, id: \.title) { section in
                        Section(section.title) {
                            ForEach(section.items, id: \.id) { item in
                                VaultItemRow(item: item)
                                    .tag(item.id)
                                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                        Button(role: .destructive) {
                                            if selectedItemID == item.id { selectedItemID = nil }
                                            appState.deleteItem(item)
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                            }
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search Passwords")
            .navigationTitle("Vault")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            showAddItem = true
                        } label: {
                            Label("New Password", systemImage: "plus")
                        }
                        Button {
                            showImport = true
                        } label: {
                            Label("Scan & Import 2FA", systemImage: "qrcode.viewfinder")
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        appState.lockVault()
                    } label: {
                        Image(systemName: "lock.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .sheet(isPresented: $showAddItem) {
                AddItemView()
            }
            .sheet(isPresented: $showImport) {
                ImportTOTPView()
            }
            .onAppear { autoSelectFirstOnPad() }
            .onChange(of: appState.vaultItems.count) { _, _ in autoSelectFirstOnPad() }
        } detail: {
            NavigationStack {
                if let id = selectedItemID,
                   let item = appState.vaultItems.first(where: { $0.id == id }) {
                    VaultItemDetailView(item: item)
                } else {
                    ContentUnavailableView(
                        "Select a Credential",
                        systemImage: "key.fill",
                        description: Text("Choose an item from the list to view and edit its details.")
                    )
                }
            }
        }
    }

    /// On iPad (regular width) auto-select the first credential so the detail pane
    /// isn't empty on launch — the Mail/Notes iPad convention. On iPhone compact we
    /// skip it so the app opens on the list, not a pushed detail.
    private func autoSelectFirstOnPad() {
        guard hSizeClass == .regular, selectedItemID == nil,
              let first = groupedSections.first?.items.first else { return }
        selectedItemID = first.id
    }

    private var emptyState: some View {
        Section {
            VStack(spacing: 16) {
                Image(systemName: "key.slash")
                    .font(.system(size: 48))
                    .foregroundStyle(.quaternary)
                Text("No Passwords Yet")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                Text("Add your first password or generate one deterministically from the Generator tab.")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)

                Button {
                    showAddItem = true
                } label: {
                    Label("Add First Password", systemImage: "plus.circle.fill")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
            .listRowBackground(Color.clear)
        }
    }

    // MARK: - Grouping

    private struct GroupedSection {
        let title: String
        let items: [VaultItem]
    }

    private var groupedSections: [GroupedSection] {
        let items = filteredItems
        let categoryOrder: [(ItemCategory, String)] = [
            (.login, "Logins"),
            (.apiKey, "Servers & Tokens"),
            (.card, "Payments"),
            (.secureNote, "Secure Notes"),
            (.identity, "Identities"),
        ]

        return categoryOrder.compactMap { (category, title) in
            let matching = items.filter { $0.category == category }
            guard !matching.isEmpty else { return nil }
            return GroupedSection(title: title, items: matching)
        }
    }

    private var filteredItems: [VaultItem] {
        if searchText.isEmpty {
            return appState.vaultItems
        }
        return appState.vaultItems.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.username.localizedCaseInsensitiveContains(searchText) ||
            $0.uri.localizedCaseInsensitiveContains(searchText)
        }
    }
}

// MARK: - Vault Item Row

private struct VaultItemRow: View {
    let item: VaultItem

    var body: some View {
        HStack(spacing: 14) {
            // Category icon with colored background
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(iconColor.opacity(0.12))
                    .frame(width: 36, height: 36)
                Image(systemName: item.category.iconName)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(iconColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.body)
                    .lineLimit(1)
                if !item.username.isEmpty {
                    Text(item.username)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if item.isFavorite {
                Image(systemName: "star.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.yellow)
            }
        }
        .padding(.vertical, 4)
    }

    private var iconColor: Color {
        switch item.category {
        case .login: .purple
        case .apiKey: .orange
        case .card: .green
        case .secureNote: .blue
        case .identity: .indigo
        }
    }
}
