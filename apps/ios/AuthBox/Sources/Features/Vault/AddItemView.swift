import SwiftUI
import AuthBoxCrypto

struct AddItemView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var title = ""
    @State private var username = ""
    @State private var password = ""
    @State private var uri = ""
    @State private var notes = ""
    @State private var category: ItemCategory = .login
    @State private var isFavorite = false
    @State private var showPasswordGenerator = false
    @State private var showPassword = false

    var body: some View {
        NavigationStack {
            Form {
                // Basic info
                Section {
                    TextField("Title", text: $title)
                    Picker("Category", selection: $category) {
                        ForEach(ItemCategory.allCases, id: \.self) { cat in
                            Label(cat.displayName, systemImage: cat.iconName)
                                .tag(cat)
                        }
                    }
                    Toggle("Favorite", isOn: $isFavorite)
                }

                // Credentials
                Section("Credentials") {
                    TextField("Username / Email", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.username)

                    HStack {
                        Group {
                            if showPassword {
                                TextField("Password", text: $password)
                            } else {
                                SecureField("Password", text: $password)
                            }
                        }
                        .textContentType(.password)

                        Button {
                            showPassword.toggle()
                        } label: {
                            Image(systemName: showPassword ? "eye.slash" : "eye")
                                .foregroundStyle(.secondary)
                        }
                    }

                    Button {
                        showPasswordGenerator = true
                    } label: {
                        Label("Generate from Seed", systemImage: "wand.and.stars")
                    }
                }

                // URL
                Section("Website") {
                    TextField("https://example.com", text: $uri)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .textContentType(.URL)
                }

                // Notes
                Section("Notes") {
                    TextEditor(text: $notes)
                        .frame(minHeight: 80)
                }
            }
            .navigationTitle("Add Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .fontWeight(.semibold)
                    .disabled(title.isEmpty)
                }
            }
            .sheet(isPresented: $showPasswordGenerator) {
                SitePasswordSheet(site: uri.isEmpty ? title : uri) { generated in
                    password = generated
                }
            }
        }
    }

    private func save() {
        let item = VaultItem(
            title: title,
            username: username,
            password: password,
            uri: uri,
            notes: notes,
            category: category,
            isFavorite: isFavorite
        )
        appState.addItem(item)
        dismiss()
    }
}

// MARK: - Quick Password Generator Sheet

private struct SitePasswordSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let site: String
    let onGenerate: (String) -> Void

    @State private var generatedPassword = ""
    @State private var length = 20.0

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Generate for: \(site)")
                    .font(.headline)

                if !generatedPassword.isEmpty {
                    Text(generatedPassword)
                        .font(.system(.title3, design: .monospaced))
                        .textSelection(.enabled)
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                HStack {
                    Text("Length: \(Int(length))")
                    Slider(value: $length, in: 8...64, step: 1)
                }
                .padding(.horizontal)
                .onChange(of: length) { _, _ in generate() }

                Spacer()

                Button {
                    onGenerate(generatedPassword)
                    dismiss()
                } label: {
                    Text("Use This Password")
                        .primaryButton()
                }
                .disabled(generatedPassword.isEmpty)
                .padding(.horizontal, VaultOnyx.horizontalPadding)
                .padding(.bottom, VaultOnyx.bottomPadding)
            }
            .padding(.top, 24)
            .navigationTitle("Generate Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear { generate() }
        }
    }

    private func generate() {
        guard !site.isEmpty else { return }
        let options = DerivePasswordOptions(length: Int(length))
        generatedPassword = appState.derivePassword(site: site, options: options) ?? ""
    }
}
