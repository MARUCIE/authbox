import SwiftUI
import AuthBoxCrypto

// MARK: - Coin presentation

enum WalletCoinStyle {
    static func glyph(_ coin: String) -> String { coin == "btc" ? "₿" : "Ξ" }
    static func name(_ coin: String) -> String { coin == "btc" ? "Bitcoin" : "Ethereum" }
    static func unit(_ coin: String) -> String { coin == "btc" ? "BTC" : "ETH" }
    static func decimals(_ coin: String) -> Int { coin == "btc" ? 8 : 18 }
    static func scriptLabel(_ s: String) -> String { s == "p2wpkh" ? "Native SegWit" : "Legacy" }
    static func color(_ coin: String) -> Color {
        coin == "btc"
            ? Color(red: 0.969, green: 0.576, blue: 0.102)   // #F7931A
            : Color(red: 0.384, green: 0.494, blue: 0.918)   // #627EEA
    }
}

// MARK: - Wallet tab

struct WalletView: View {
    @EnvironmentObject var appState: AppState
    @State private var showAdd = false
    /// Drives the NavigationSplitView detail (iPad: accounts list + detail side by side;
    /// iPhone compact: auto-collapses to a push stack).
    @State private var selectedAccountID: UUID?
    @Environment(\.horizontalSizeClass) private var hSizeClass

    var body: some View {
        NavigationSplitView {
            List(selection: $selectedAccountID) {
                if appState.walletAccounts.isEmpty {
                    emptyState
                } else {
                    Section {
                        ForEach(appState.walletAccounts) { account in
                            WalletAccountRow(descriptor: account)
                                .tag(account.id)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        if selectedAccountID == account.id { selectedAccountID = nil }
                                        appState.removeWalletAccount(account)
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                }
                        }
                    } footer: {
                        Text("Self-custodial · watch-only. Keys are derived from your vault seed on this device and never leave it.")
                    }
                }
            }
            .navigationTitle("Wallet")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showAdd) { AddWalletAccountView() }
            .onAppear { autoSelectFirstOnPad() }
            .onChange(of: appState.walletAccounts.count) { _, _ in autoSelectFirstOnPad() }
        } detail: {
            NavigationStack {
                if let id = selectedAccountID,
                   let account = appState.walletAccounts.first(where: { $0.id == id }) {
                    WalletAccountDetailView(descriptor: account)
                } else {
                    ContentUnavailableView(
                        "Select an Account",
                        systemImage: "wallet.bifold",
                        description: Text("Choose a wallet account to view its balance and receive address.")
                    )
                }
            }
        }
    }

    /// iPad (regular width): preselect the first account so the detail pane shows a
    /// balance on launch instead of the placeholder. iPhone compact stays on the list.
    private func autoSelectFirstOnPad() {
        guard hSizeClass == .regular, selectedAccountID == nil,
              let first = appState.walletAccounts.first else { return }
        selectedAccountID = first.id
    }

    private var emptyState: some View {
        Section {
            VStack(spacing: 16) {
                Image(systemName: "wallet.bifold")
                    .font(.system(size: 48))
                    .foregroundStyle(.quaternary)
                Text("No Wallet Accounts")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                Text("Add a Bitcoin or Ethereum account. Its keys are derived from the same 24-word seed that protects your vault — recoverable in any standard wallet.")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                Button { showAdd = true } label: {
                    Label("Add First Account", systemImage: "plus.circle.fill")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
            .listRowBackground(Color.clear)
        }
    }
}

// MARK: - Account row

private struct WalletAccountRow: View {
    @EnvironmentObject var appState: AppState
    let descriptor: WalletAccountDescriptor

    var body: some View {
        HStack(spacing: 14) {
            CoinBadge(coin: descriptor.coin)
            VStack(alignment: .leading, spacing: 2) {
                Text(descriptor.label).font(.body).lineLimit(1)
                Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            if descriptor.network == "testnet" {
                Text("TESTNET")
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.yellow.opacity(0.2))
                    .foregroundStyle(.orange)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 4)
    }

    private var subtitle: String {
        var parts = [WalletCoinStyle.name(descriptor.coin)]
        if descriptor.coin == "btc" { parts.append(WalletCoinStyle.scriptLabel(descriptor.scriptType)) }
        if let addr = appState.walletReceiveAddress(for: descriptor)?.address {
            parts.append(truncate(addr))
        }
        return parts.joined(separator: " · ")
    }

    private func truncate(_ s: String) -> String {
        s.count > 14 ? "\(s.prefix(7))…\(s.suffix(5))" : s
    }
}

private struct CoinBadge: View {
    let coin: String
    var body: some View {
        ZStack {
            Circle().fill(WalletCoinStyle.color(coin).opacity(0.14)).frame(width: 38, height: 38)
            Text(WalletCoinStyle.glyph(coin))
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(WalletCoinStyle.color(coin))
        }
    }
}

// MARK: - Account detail

struct WalletAccountDetailView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    let descriptor: WalletAccountDescriptor

    @State private var balanceText: String?
    @State private var loadingBalance = false
    @State private var balanceError: String?
    @State private var copied = false

    private let balanceService = WalletBalanceService()

    var body: some View {
        List {
            balanceSection
            receiveSection
            detailsSection
            Section {
                Button(role: .destructive) {
                    appState.removeWalletAccount(descriptor)
                    dismiss()
                } label: {
                    Label("Remove Account", systemImage: "trash")
                }
            }
        }
        .navigationTitle(descriptor.label)
        .navigationBarTitleDisplayMode(.inline)
        .task { await refreshBalance() }
    }

    // MARK: Sections

    private var balanceSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    CoinBadge(coin: descriptor.coin)
                    VStack(alignment: .leading, spacing: 2) {
                        if let balanceText {
                            Text("\(balanceText) \(WalletCoinStyle.unit(descriptor.coin))")
                                .font(.title2.weight(.semibold)).monospacedDigit()
                        } else if loadingBalance {
                            Text("Loading…").font(.title3).foregroundStyle(.secondary)
                        } else {
                            Text("—").font(.title2).foregroundStyle(.secondary)
                        }
                        Text(balanceError ?? "Confirmed balance")
                            .font(.caption)
                            .foregroundStyle(balanceError == nil ? Color.secondary : Color.red)
                    }
                    Spacer()
                    Button { Task { await refreshBalance() } } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(loadingBalance)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private var receiveSection: some View {
        Section {
            if let address = appState.walletReceiveAddress(for: descriptor)?.address {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Receive address").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        networkChip
                    }
                    Text(address)
                        .font(.system(.footnote, design: .monospaced))
                        .textSelection(.enabled)
                    Button {
                        UIPasteboard.general.string = address
                        copied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
                    } label: {
                        Label(copied ? "Copied" : "Copy address", systemImage: copied ? "checkmark" : "doc.on.doc")
                            .font(.footnote)
                    }
                    Text("Only send \(WalletCoinStyle.unit(descriptor.coin)) on \(descriptor.network) to this address.")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
                .padding(.vertical, 4)
            } else {
                Text("Unlock the vault to derive this address.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private var detailsSection: some View {
        Section("Account") {
            LabeledContent("Coin", value: WalletCoinStyle.name(descriptor.coin))
            if descriptor.coin == "btc" {
                LabeledContent("Type", value: WalletCoinStyle.scriptLabel(descriptor.scriptType))
            }
            LabeledContent("Network", value: descriptor.network.capitalized)
            if let path = appState.walletReceiveAddress(for: descriptor)?.path {
                LabeledContent("Path", value: path)
            }
            if let xpub = appState.walletAccountXpub(for: descriptor) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Account xpub (watch-only)").font(.caption).foregroundStyle(.secondary)
                    Text(xpub)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(2).truncationMode(.middle)
                        .textSelection(.enabled)
                }
            }
        }
    }

    private var networkChip: some View {
        Text(descriptor.network == "testnet" ? "TESTNET" : WalletCoinStyle.unit(descriptor.coin) + " · mainnet")
            .font(.system(size: 10, weight: .bold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((descriptor.network == "testnet" ? Color.orange : WalletCoinStyle.color(descriptor.coin)).opacity(0.15))
            .foregroundStyle(descriptor.network == "testnet" ? .orange : WalletCoinStyle.color(descriptor.coin))
            .clipShape(Capsule())
    }

    // MARK: Balance

    private func refreshBalance() async {
        guard let address = appState.walletReceiveAddress(for: descriptor)?.address else { return }
        loadingBalance = true
        balanceError = nil
        defer { loadingBalance = false }
        do {
            let balance = try await balanceService.balance(
                coin: descriptor.coin, network: descriptor.network, address: address
            )
            balanceText = WalletAmount.formatUnits(
                balance.confirmed, decimals: WalletCoinStyle.decimals(descriptor.coin)
            )
        } catch {
            balanceError = "Balance unavailable"
        }
    }
}

// MARK: - Add account

struct AddWalletAccountView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var coin: Wallet.Coin = .btc
    @State private var network: Wallet.WalletNetwork = .mainnet
    @State private var scriptType: Wallet.BtcScriptType = .p2wpkh
    @State private var label = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Coin") {
                    Picker("Coin", selection: $coin) {
                        Text("Bitcoin").tag(Wallet.Coin.btc)
                        Text("Ethereum").tag(Wallet.Coin.eth)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Options") {
                    Picker("Network", selection: $network) {
                        Text("Mainnet").tag(Wallet.WalletNetwork.mainnet)
                        Text("Testnet").tag(Wallet.WalletNetwork.testnet)
                    }
                    if coin == .btc {
                        Picker("Address type", selection: $scriptType) {
                            Text("Native SegWit").tag(Wallet.BtcScriptType.p2wpkh)
                            Text("Legacy").tag(Wallet.BtcScriptType.p2pkh)
                        }
                    }
                    TextField("Label (optional)", text: $label)
                }

                Section {
                    Text("The account is derived from your vault seed using the BIP-44/84 standard. Only the public address is shown — your keys never leave this device.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Add Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        appState.addWalletAccount(coin: coin, network: network, scriptType: scriptType, label: label)
                        dismiss()
                    }
                }
            }
        }
    }
}
