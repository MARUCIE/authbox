import SwiftUI

struct VaultListView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var showAddItem = false
    @State private var selectedTab: Tab = .passwords

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
    }

    // MARK: - Passwords Tab

    private var passwordsTab: some View {
        NavigationStack {
            List {
                if filteredItems.isEmpty && searchText.isEmpty {
                    emptyState
                } else if filteredItems.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                } else {
                    // Grouped by category
                    ForEach(groupedSections, id: \.title) { section in
                        Section(section.title) {
                            ForEach(section.items, id: \.id) { item in
                                NavigationLink(destination: VaultItemDetailView(item: item)) {
                                    VaultItemRow(item: item)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
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
                    Button {
                        showAddItem = true
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
        }
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
