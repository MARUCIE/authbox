//
//  GeneratorView.swift
//  P2 — standalone password generator. Two modes mirror PasswordGenerator:
//    - Random:        CSPRNG output, copy to clipboard.
//    - Deterministic: seed + site → reproducible password (requires unlock).
//

import SwiftUI

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
                Section("Site / context") {
                    TextField("e.g. github.com", text: $site)
                    Text("Same seed + same site → same password. Nothing is stored.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            Section {
                Button("Generate") { generate() }
                    .disabled(mode == .deterministic && (site.isEmpty || !session.hasVaultKey))
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
    }

    private func generate() {
        switch mode {
        case .random:
            output = PasswordGenerator.random(options)
        case .deterministic:
            // The vault key doubles as the deterministic seed while unlocked.
            // Borrow it (SEC-003) so the key copy is zeroed right after use.
            if let result = session.withVaultKey({ PasswordGenerator.deterministic(seed: $0, site: site, options) }) {
                output = result
            }
        }
    }

    private func copy(_ s: String) {
        #if canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(s, forType: .string)
        #endif
    }
}
