//
//  GeneratorView.swift
//  P2 — standalone password generator. Two modes mirror PasswordGenerator:
//    - Random:        CSPRNG output, copy to clipboard.
//    - Deterministic: seed + site → reproducible password (requires unlock).
//

import SwiftUI
import AuthBoxCrypto

struct GeneratorView: View {
    @EnvironmentObject private var session: VaultSession

    @State private var mode: Mode = .random
    @State private var length: Double = 20
    @State private var useLower = true
    @State private var useUpper = true
    @State private var useDigits = true
    @State private var useSymbols = true
    @State private var site = ""
    @State private var output = ""
    // Deterministic mode derives from the REAL 24-word phrase, entered
    // transiently and never stored. The vault key is NOT a substitute seed:
    // iOS/web derive from the BIP-39 seed, so vault-key-derived passwords
    // silently diverged across platforms — a same-mnemonic user regenerating
    // on another device got a different password for the same site.
    @State private var mnemonic = ""

    enum Mode: String, CaseIterable, Identifiable { case random = "Random", deterministic = "Deterministic"; var id: String { rawValue } }

    private var options: PasswordGenerator.Options {
        PasswordGenerator.Options(length: Int(length), lowercase: useLower,
                                  uppercase: useUpper, digits: useDigits, symbols: useSymbols)
    }

    var body: some View {
        Form {
            Picker("Mode", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            Section("Options") {
                LabeledContent("Length") {
                    HStack { Slider(value: $length, in: 8...64, step: 1); Text("\(Int(length))").monospacedDigit() }
                }
                Toggle("Lowercase a-z", isOn: $useLower)
                Toggle("Uppercase A-Z", isOn: $useUpper)
                Toggle("Digits 0-9", isOn: $useDigits)
                Toggle("Symbols", isOn: $useSymbols)
            }

            if mode == .deterministic {
                Section("Recovery phrase") {
                    TextEditor(text: $mnemonic)
                        .font(.system(.body, design: .monospaced))
                        .frame(height: 64)
                    Text("Kept in memory only, cleared when you leave this screen.")
                        .font(.caption).foregroundStyle(.secondary)
                    if !normalizedMnemonic.isEmpty && !mnemonicValid {
                        Text("Invalid recovery phrase. Check spelling and word order.")
                            .font(.caption).foregroundStyle(.red)
                    }
                }
                Section("Site / context") {
                    TextField("e.g. github.com", text: $site)
                    Text("Same seed + same site → same password. Nothing is stored.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            Section {
                Button("Generate") { generate() }
                    .disabled(mode == .deterministic && (site.isEmpty || !mnemonicValid))
                if !output.isEmpty {
                    LabeledContent("Result") {
                        HStack {
                            Text(output).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                            Button { copy(output) } label: { Image(systemName: "doc.on.doc") }
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Generator")
        .onDisappear { mnemonic = "" }   // never keep the phrase past this screen
    }

    private var normalizedMnemonic: String {
        mnemonic.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var mnemonicValid: Bool {
        !normalizedMnemonic.isEmpty && Seed.validateMnemonic(normalizedMnemonic)
    }

    private func generate() {
        switch mode {
        case .random:
            output = PasswordGenerator.random(options)
        case .deterministic:
            guard mnemonicValid else { return }
            // Real 64-byte BIP-39 seed, same as iOS/web — zeroed right after.
            var seed = Seed.mnemonicToSeed(normalizedMnemonic)
            defer { seed.resetBytes(in: 0..<seed.count) }
            output = PasswordGenerator.deterministic(seed: seed, site: site, options)
        }
    }

    private func copy(_ s: String) {
        SecretPasteboard.copy(s)
    }
}
