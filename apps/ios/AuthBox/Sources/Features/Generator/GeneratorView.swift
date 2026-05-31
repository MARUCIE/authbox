import SwiftUI
import AuthBoxCrypto

struct GeneratorView: View {
    @EnvironmentObject var appState: AppState
    @State private var site = ""
    @State private var generatedPassword = ""
    @State private var length = 20.0
    @State private var useLowercase = true
    @State private var useUppercase = true
    @State private var useDigits = true
    @State private var useSymbols = true
    @State private var counter = 0
    @State private var copied = false

    var body: some View {
        NavigationStack {
            Form {
                // Site input
                Section {
                    TextField("e.g. github.com", text: $site)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .onChange(of: site) { _, _ in generate() }
                } header: {
                    Text("Site")
                }

                // Generated password
                Section {
                    if generatedPassword.isEmpty {
                        HStack {
                            Image(systemName: "wand.and.stars")
                                .foregroundStyle(.quaternary)
                            Text("Enter a site name to generate")
                                .foregroundStyle(.tertiary)
                        }
                    } else {
                        HStack {
                            Text(generatedPassword)
                                .font(.system(.body, design: .monospaced))
                                .textSelection(.enabled)
                                .lineLimit(2)

                            Spacer()

                            Button {
                                UIPasteboard.general.string = generatedPassword
                                withAnimation(.easeInOut(duration: 0.2)) { copied = true }
                                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                    withAnimation { copied = false }
                                }
                            } label: {
                                Image(systemName: copied ? "checkmark.circle.fill" : "doc.on.doc")
                                    .font(.system(size: 18))
                                    .foregroundStyle(copied ? .green : .blue)
                            }
                        }
                    }
                } header: {
                    Text("Generated Password")
                }

                // Options
                Section {
                    VStack(spacing: 4) {
                        HStack {
                            Text("Length")
                            Spacer()
                            Text("\(Int(length))")
                                .font(.system(.body, design: .monospaced))
                                .foregroundStyle(.blue)
                                .frame(width: 32, alignment: .trailing)
                        }
                        Slider(value: $length, in: 8...64, step: 1)
                            .onChange(of: length) { _, _ in generate() }
                    }

                    Toggle("Lowercase (a-z)", isOn: $useLowercase)
                        .onChange(of: useLowercase) { _, _ in generate() }
                    Toggle("Uppercase (A-Z)", isOn: $useUppercase)
                        .onChange(of: useUppercase) { _, _ in generate() }
                    Toggle("Digits (0-9)", isOn: $useDigits)
                        .onChange(of: useDigits) { _, _ in generate() }
                    Toggle("Symbols (!@#...)", isOn: $useSymbols)
                        .onChange(of: useSymbols) { _, _ in generate() }

                    Stepper("Counter: \(counter)", value: $counter, in: 0...99)
                        .onChange(of: counter) { _, _ in generate() }
                } header: {
                    Text("Options")
                }

                // Footer
                Section {
                    HStack(spacing: 8) {
                        Image(systemName: "info.circle")
                            .foregroundStyle(.blue)
                        Text("Same seed + site = same password. Works offline, no storage needed.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Generator")
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private func generate() {
        guard !site.isEmpty else {
            generatedPassword = ""
            return
        }
        let options = DerivePasswordOptions(
            length: Int(length),
            lowercase: useLowercase,
            uppercase: useUppercase,
            digits: useDigits,
            symbols: useSymbols,
            counter: counter
        )
        generatedPassword = appState.derivePassword(site: site, options: options) ?? ""
    }
}
