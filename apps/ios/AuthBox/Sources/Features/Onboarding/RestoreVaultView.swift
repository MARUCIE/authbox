import SwiftUI
import AuthBoxCrypto

struct RestoreVaultView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @State private var mnemonicInput = ""
    @State private var error: String?
    @State private var isRestoring = false

    private var wordCount: Int {
        mnemonicInput
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: " ")
            .filter { !$0.isEmpty }
            .count
    }

    var body: some View {
        NavigationStack {
            ZStack {
                VaultOnyx.darkBackground.ignoresSafeArea()

                VStack(spacing: 20) {
                    // Icon
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 44))
                        .foregroundStyle(VaultOnyx.iconGradient)
                        .padding(.top, 16)

                    // Title
                    VStack(spacing: 8) {
                        Text("Restore from Seed Phrase")
                            .font(.title2.bold())
                            .foregroundStyle(.white)

                        Text("Enter your 24-word seed phrase to restore your vault.")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.6))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    // Text editor with word display
                    TextEditor(text: $mnemonicInput)
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.white)
                        .frame(minHeight: 160)
                        .scrollContentBackground(.hidden)
                        .padding(12)
                        .background(VaultOnyx.fieldBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(
                                    wordCount == 24 ? Color.green.opacity(0.5) : VaultOnyx.surfaceBorder,
                                    lineWidth: wordCount == 24 ? 2 : 1
                                )
                        )
                        .padding(.horizontal, VaultOnyx.horizontalPadding)

                    // Word counter
                    HStack {
                        Spacer()
                        Text("\(wordCount) / 24 words")
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(wordCount == 24 ? .green : .white.opacity(0.4))
                            .padding(.trailing, VaultOnyx.horizontalPadding)
                    }

                    if let error {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundStyle(.red)
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red.opacity(0.9))
                        }
                        .padding(.horizontal)
                    }

                    Spacer()

                    // Restore button
                    Button {
                        restore()
                    } label: {
                        if isRestoring {
                            ProgressView()
                                .tint(.white)
                                .primaryButton()
                        } else {
                            Text("Restore Vault")
                                .primaryButton()
                        }
                    }
                    .disabled(wordCount != 24 || isRestoring)
                    .opacity(wordCount == 24 ? 1.0 : 0.5)
                    .padding(.horizontal, VaultOnyx.horizontalPadding)
                    .padding(.bottom, VaultOnyx.bottomPadding)
                }
            }
            .navigationTitle("Restore")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func restore() {
        isRestoring = true
        error = nil

        Task {
            do {
                try appState.restoreFromMnemonic(
                    mnemonicInput.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            isRestoring = false
        }
    }
}
