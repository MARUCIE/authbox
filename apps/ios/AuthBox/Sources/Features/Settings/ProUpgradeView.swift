import SwiftUI

/// Small "PRO" pill shown next to Pro-gated controls for free users.
struct ProLockBadge: View {
    var body: some View {
        Text("PRO")
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                LinearGradient(colors: [.orange, .yellow],
                               startPoint: .leading, endPoint: .trailing)
            )
            .clipShape(Capsule())
    }
}

struct ProUpgradeView: View {
    @ObservedObject var proManager = ProManager.shared
    @Environment(\.dismiss) var dismiss
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    // Header
                    VStack(spacing: 12) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 56))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [.yellow, .orange],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )

                        Text("Auth Box Pro")
                            .font(.title.bold())

                        Text("Unlock the full power of your credential hub")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 20)

                    // Feature comparison
                    VStack(spacing: 0) {
                        // Column headers
                        HStack {
                            Text("Feature")
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("FREE")
                                .font(.caption2.bold())
                                .foregroundStyle(.secondary)
                                .frame(width: 50)
                            Text("PRO")
                                .font(.caption2.bold())
                                .foregroundStyle(.blue)
                                .frame(width: 70)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        Divider()

                        featureRow("Unlimited Passwords", free: true, pro: true)
                        Divider()
                        featureRow("Seed Phrase Recovery", free: true, pro: true)
                        Divider()
                        featureRow("Face ID Unlock", free: true, pro: true)
                        Divider()
                        featureRow("Password Generator", free: true, pro: true)
                        Divider()
                        featureRow("API Keys (5)", free: true, pro: false, proLabel: "Unlimited")
                        Divider()
                        featureRow("Multi-Device Sync", free: false, pro: true)
                        Divider()
                        featureRow("13 Import Sources", free: false, pro: true)
                        Divider()
                        featureRow("API Key Health Check", free: false, pro: true)
                        Divider()
                        featureRow("MCP Agent Gateway", free: false, pro: true, highlight: true)
                        Divider()
                        featureRow("Arweave Backup", free: false, pro: true)
                        Divider()
                        featureRow("Audit Log", free: false, pro: true)
                    }
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
                    .padding(.horizontal)

                    // Price (real StoreKit localized price once the product loads)
                    VStack(spacing: 8) {
                        Text(proManager.displayPrice ?? "$29")
                            .font(.system(size: 48, weight: .bold))
                            .contentTransition(.numericText())
                        Text("One-time purchase. No subscription.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("= 2 months of 1Password, but forever")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    if let error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    // CTA
                    VStack(spacing: 12) {
                        Button {
                            purchase()
                        } label: {
                            HStack {
                                if proManager.isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Image(systemName: "crown.fill")
                                    Text("Upgrade to Pro — \(proManager.displayPrice ?? "$29")")
                                }
                            }
                            .primaryButton()
                        }
                        .disabled(proManager.isLoading)

                        Button {
                            restore()
                        } label: {
                            Text("Restore Purchase")
                                .font(.subheadline)
                                .foregroundStyle(.blue)
                        }
                    }
                    .padding(.horizontal, VaultOnyx.horizontalPadding)
                    .padding(.bottom, 32)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Pro")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await proManager.loadProduct() }
        }
    }

    private func featureRow(_ name: String, free: Bool, pro: Bool, proLabel: String? = nil, highlight: Bool = false) -> some View {
        HStack {
            Text(name)
                .font(highlight ? .subheadline.bold() : .subheadline)
                .foregroundStyle(highlight ? .blue : .primary)
            Spacer()
            // Free column
            if free {
                Image(systemName: "checkmark")
                    .foregroundStyle(.green)
                    .frame(width: 50)
            } else {
                Image(systemName: "minus")
                    .foregroundStyle(.quaternary)
                    .frame(width: 50)
            }
            // Pro column
            if let proLabel {
                Text(proLabel)
                    .font(.caption.bold())
                    .foregroundStyle(.blue)
                    .frame(width: 70)
            } else if pro {
                Image(systemName: "checkmark")
                    .foregroundStyle(.blue)
                    .frame(width: 70)
            } else {
                Image(systemName: "minus")
                    .foregroundStyle(.quaternary)
                    .frame(width: 70)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func purchase() {
        Task {
            do {
                try await proManager.purchase()
                if proManager.isPro { dismiss() }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func restore() {
        Task {
            do {
                try await proManager.restorePurchases()
                if proManager.isPro { dismiss() }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
