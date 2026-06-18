import SwiftUI

/// Two-stage Send flow mirroring the web wallet: Review builds + signs the
/// transaction entirely on-device (no broadcast yet), then Confirm relays the
/// signed bytes. Mainnet money-movement is gated behind an explicit double-confirm
/// toggle so a real send can never happen on a single tap.
struct SendWalletView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    let descriptor: WalletAccountDescriptor

    @State private var toAddress: String
    @State private var amount: String
    @State private var preview: WalletSendPreview?
    @State private var mainnetConfirmed = false
    @State private var busy = false
    @State private var sentTxid: String?
    @State private var errorMessage: String?

    /// Confirmed spendable balance (human units), shown on the input form so the
    /// user knows what they have before composing. Same source/format as the
    /// wallet detail screen (WalletBalanceService → formatUnits).
    @State private var availableBalance: String?
    @State private var loadingBalance = false
    private let balanceService = WalletBalanceService()

    /// When true, the Review step is built automatically once on first appear —
    /// used by the Send-demo visual-acceptance seam to land directly on a Review
    /// populated from live tx-prep, with no tap. Defaults to off for normal use.
    private let autoReview: Bool

    /// Recipient + amount may be prefilled (e.g. a scanned QR, a repeat send, or
    /// the visual-acceptance seam). Both default to empty for a fresh compose.
    init(descriptor: WalletAccountDescriptor,
         initialTo: String = "",
         initialAmount: String = "",
         autoReview: Bool = false) {
        self.descriptor = descriptor
        self._toAddress = State(initialValue: initialTo)
        self._amount = State(initialValue: initialAmount)
        self.autoReview = autoReview
    }

    private var isTestnet: Bool { descriptor.network == "testnet" }
    private var unit: String { WalletCoinStyle.unit(descriptor.coin) }

    /// True only once the user has typed something that is not a valid recipient
    /// for this account's network — empty stays neutral (no error before input).
    private var recipientInvalid: Bool {
        !toAddress.isEmpty && !appState.walletValidateAddress(toAddress, for: descriptor)
    }

    /// Explicit network tag for the confirm screen. Testnet reads calm (orange);
    /// mainnet reads as a warning (red) to reinforce the real-money gate.
    private var networkBadge: some View {
        Text(isTestnet ? "TESTNET" : "MAINNET")
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((isTestnet ? Color.orange : Color.red).opacity(0.16), in: Capsule())
            .foregroundStyle(isTestnet ? Color.orange : Color.red)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let sentTxid {
                    sentView(txid: sentTxid)
                } else if let preview {
                    reviewForm(preview)
                } else {
                    inputForm
                }
            }
            .navigationTitle(sentTxid == nil ? "Send \(unit)" : "Sent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(sentTxid == nil ? "Cancel" : "Done") { dismiss() }
                }
            }
            .alert("Couldn’t send", isPresented: Binding(
                get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
            .task {
                // Always surface the spendable balance on the input form.
                await refreshBalance()
                // Visual-acceptance seam: build the Review once from live tx-prep
                // with no tap. Guarded so it fires only when explicitly requested
                // and the form is prefilled and untouched.
                if autoReview, preview == nil, sentTxid == nil, !toAddress.isEmpty, !amount.isEmpty {
                    await review()
                }
            }
        }
    }

    // MARK: - Stage 1: input

    private var inputForm: some View {
        Form {
            Section {
                TextField("\(unit) address", text: $toAddress, axis: .vertical)
                    .font(.system(.footnote, design: .monospaced))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .lineLimit(1...3)
            } header: {
                Text("Recipient")
            } footer: {
                // Inline validity BEFORE Review, so a malformed or wrong-network
                // address is caught at compose time, not as an alert after build.
                if recipientInvalid {
                    Label("Not a valid \(isTestnet ? "testnet" : "mainnet") \(unit) address",
                          systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                } else if !toAddress.isEmpty {
                    Label("Valid \(unit) address", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }
            Section {
                HStack {
                    TextField("0.0", text: $amount)
                        .keyboardType(.decimalPad)
                        .font(.title3.monospacedDigit())
                    Text(unit).foregroundStyle(.secondary)
                }
            } header: {
                Text("Amount")
            } footer: {
                HStack(spacing: 4) {
                    if loadingBalance {
                        ProgressView().controlSize(.mini)
                        Text("Checking balance…")
                    } else if let availableBalance {
                        Text("Available: \(availableBalance) \(unit)")
                    } else {
                        Text("Available balance unavailable")
                    }
                }
            }
            Section {
                Button {
                    Task { await review() }
                } label: {
                    HStack {
                        if busy { ProgressView().padding(.trailing, 4) }
                        Text(busy ? "Building transaction…" : "Review")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || toAddress.isEmpty || amount.isEmpty || recipientInvalid)
            } footer: {
                Text(isTestnet
                     ? "Testnet transaction — no real value moves."
                     : "Mainnet — this moves real \(unit). You’ll confirm again before it broadcasts.")
            }
        }
    }

    // MARK: - Stage 2: review

    private func reviewForm(_ p: WalletSendPreview) -> some View {
        Form {
            Section {
                LabeledContent("To") {
                    // Never truncate the recipient on a confirm screen — the user
                    // must be able to read every character to verify it, and
                    // select it to cross-check. Truncation here is a funds risk.
                    Text(p.toAddress)
                        .font(.system(.caption, design: .monospaced))
                        .multilineTextAlignment(.trailing)
                        .textSelection(.enabled)
                }
                LabeledContent("Amount", value: p.amountDisplay)
                LabeledContent("Network fee", value: p.feeDisplay)
                LabeledContent("Total", value: p.totalDisplay).bold()
            } header: {
                HStack {
                    Text("Review")
                    Spacer()
                    networkBadge   // testnet vs mainnet at a glance on the confirm screen
                }
            }
            Section {
                LabeledContent(descriptor.coin == "btc" ? "Txid" : "Tx hash") {
                    Text(p.txid)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing).lineLimit(2).truncationMode(.middle)
                }
            } footer: {
                Text("The transaction is already signed on this device. Confirm to broadcast it.")
            }

            if !isTestnet {
                Section {
                    Toggle(isOn: $mainnetConfirmed) {
                        Text("I confirm sending real \(unit) on mainnet.")
                            .font(.footnote)
                    }
                    .tint(.red)
                }
            }

            Section {
                Button {
                    Task { await broadcast(p) }
                } label: {
                    HStack {
                        if busy { ProgressView().padding(.trailing, 4) }
                        Text(busy ? "Broadcasting…" : "Confirm & Send")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(isTestnet ? WalletCoinStyle.color(descriptor.coin) : .red)
                .disabled(busy || (!isTestnet && !mainnetConfirmed))

                Button("Back") { preview = nil; mainnetConfirmed = false }
                    .frame(maxWidth: .infinity)
                    .disabled(busy)
            }
        }
    }

    // MARK: - Stage 3: sent

    private func sentView(txid: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56)).foregroundStyle(.green)
            Text("Transaction broadcast")
                .font(.title3.weight(.semibold))
            VStack(spacing: 6) {
                Text(descriptor.coin == "btc" ? "Txid" : "Tx hash")
                    .font(.caption).foregroundStyle(.secondary)
                Text(txid)
                    .font(.system(.caption, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)
                    .padding(.horizontal)
            }
            Button {
                UIPasteboard.general.string = txid
            } label: {
                Label("Copy \(descriptor.coin == "btc" ? "txid" : "hash")", systemImage: "doc.on.doc")
            }
            .buttonStyle(.bordered)
            Spacer()
        }
        .padding(.top, 48)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Actions

    private func review() async {
        busy = true; defer { busy = false }
        do {
            preview = try await appState.walletPrepareSend(
                descriptor: descriptor, toAddress: toAddress, amountInput: amount)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func broadcast(_ p: WalletSendPreview) async {
        busy = true; defer { busy = false }
        do {
            sentTxid = try await appState.walletBroadcast(p)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func refreshBalance() async {
        guard let address = appState.walletReceiveAddress(for: descriptor)?.address else { return }
        loadingBalance = true
        defer { loadingBalance = false }
        do {
            let balance = try await balanceService.balance(
                coin: descriptor.coin, network: descriptor.network, address: address)
            availableBalance = WalletAmount.formatUnits(
                balance.confirmed, decimals: WalletCoinStyle.decimals(descriptor.coin))
        } catch {
            availableBalance = nil   // footer falls back to "unavailable"
        }
    }
}
