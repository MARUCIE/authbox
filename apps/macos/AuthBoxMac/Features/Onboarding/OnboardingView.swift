//
//  OnboardingView.swift
//  P2 — first-run vault provisioning. Generates a BIP-39 mnemonic (the user's
//  offline recovery), shows it for the user to write down, then provisions the
//  vault: derive keys → wrap the vault key in the Secure Enclave → unlock.
//
//  The mnemonic is NEVER persisted. Once provisioned, the vault key is recovered
//  only by the Secure Enclave (Touch ID) or by re-entering the mnemonic.
//

import SwiftUI
import AuthBoxCrypto

struct OnboardingView: View {
    @EnvironmentObject private var session: VaultSession

    @State private var step: Step = .intro
    @State private var mnemonic: String = ""
    @State private var confirmedSaved = false
    @State private var importText = ""
    @State private var error: String?

    enum Step { case intro, showPhrase, importPhrase }

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "lock.shield").font(.system(size: 48)).foregroundStyle(.tint)
            Text("Set up your vault").font(.largeTitle.weight(.bold))

            switch step {
            case .intro:           introStep
            case .showPhrase:      showPhraseStep
            case .importPhrase:    importStep
            }

            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }
        .padding(40)
        .frame(maxWidth: 560)
    }

    private var introStep: some View {
        VStack(spacing: 16) {
            Text("Your vault is protected by a 24-word recovery phrase and your Mac's Touch ID. The phrase is the only way to recover your vault on another device — store it offline.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Create a new vault") {
                mnemonic = Seed.generateMnemonic()
                step = .showPhrase
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            Button("I already have a recovery phrase") { step = .importPhrase }
                .buttonStyle(.link)
        }
    }

    private var showPhraseStep: some View {
        VStack(spacing: 16) {
            Text("Write these 24 words down in order. Anyone with them can unlock your vault.")
                .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
            phraseGrid(mnemonic)
            Toggle("I have written down my recovery phrase", isOn: $confirmedSaved)
            Button("Finish setup") { provision(with: mnemonic) }
                .buttonStyle(.borderedProminent).controlSize(.large)
                .disabled(!confirmedSaved)
        }
    }

    private var importStep: some View {
        VStack(spacing: 16) {
            Text("Enter your 24-word recovery phrase, separated by spaces.")
                .font(.callout).foregroundStyle(.secondary)
            TextEditor(text: $importText)
                .font(.system(.body, design: .monospaced))
                .frame(height: 120).border(.quaternary)
            HStack {
                Button("Back") { step = .intro }
                Button("Unlock vault") {
                    provision(with: importText.trimmingCharacters(in: .whitespacesAndNewlines))
                }
                .buttonStyle(.borderedProminent)
                .disabled(importText.split(separator: " ").count < 12)
            }
        }
    }

    private func phraseGrid(_ phrase: String) -> some View {
        let words = phrase.split(separator: " ").map(String.init)
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
            ForEach(Array(words.enumerated()), id: \.offset) { idx, word in
                HStack(spacing: 6) {
                    Text("\(idx + 1)").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                    Text(word).font(.system(.body, design: .monospaced))
                }
                .padding(.vertical, 4).padding(.horizontal, 8)
                .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    private func provision(with phrase: String) {
        do {
            try session.provisionAndUnlock(mnemonic: phrase)
        } catch {
            self.error = "Setup failed: \(error)"
        }
    }
}
