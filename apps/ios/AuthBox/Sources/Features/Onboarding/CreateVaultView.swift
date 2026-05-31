import SwiftUI
import AuthBoxCrypto

struct CreateVaultView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @State private var step: Step = .generate
    @State private var mnemonic = ""
    @State private var words: [String] = []
    @State private var masterPassword = ""
    @State private var confirmPassword = ""
    @State private var error: String?

    enum Step: Int, CaseIterable {
        case generate = 0
        case backup = 1
        case password = 2

        var label: String {
            switch self {
            case .generate: "Generate"
            case .backup: "Backup"
            case .password: "Password"
            }
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                VaultOnyx.darkBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Step indicator
                    stepIndicator
                        .padding(.top, 8)
                        .padding(.bottom, 4)

                    Group {
                        switch step {
                        case .generate:
                            generateStep
                        case .backup:
                            backupStep
                        case .password:
                            passwordStep
                        }
                    }
                }
            }
            .navigationTitle("Create Vault")
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

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        HStack(spacing: 0) {
            ForEach(Step.allCases, id: \.rawValue) { s in
                VStack(spacing: 6) {
                    Circle()
                        .fill(s.rawValue <= step.rawValue ? VaultOnyx.accentBlue : Color.white.opacity(0.15))
                        .frame(width: 8, height: 8)
                    Text(s.label)
                        .font(.caption2)
                        .foregroundStyle(s.rawValue <= step.rawValue ? .white : .white.opacity(0.35))
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Step 1: Generate

    private var generateStep: some View {
        VStack(spacing: 24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.06))
                    .frame(width: 180, height: 180)
                Circle()
                    .fill(Color.blue.opacity(0.03))
                    .frame(width: 240, height: 240)
                Image(systemName: "dice.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(VaultOnyx.iconGradient)
            }

            VStack(spacing: 10) {
                Text("Generate Seed Phrase")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

                Text("This 24-word phrase is the ONLY way to recover your vault. Write it down and store it safely.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            Spacer()

            Button {
                mnemonic = Seed.generateMnemonic(strength: 256)
                words = mnemonic.split(separator: " ").map(String.init)
                withAnimation { step = .backup }
            } label: {
                Text("Generate 24 Words")
                    .primaryButton()
            }
            .padding(.horizontal, VaultOnyx.horizontalPadding)
            .padding(.bottom, VaultOnyx.bottomPadding)
        }
    }

    // MARK: - Step 2: Backup

    private var backupStep: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("Write Down Your\nSeed Phrase")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.top, 16)

                // 3-column word grid
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(Array(words.enumerated()), id: \.offset) { index, word in
                        HStack(spacing: 4) {
                            Text("\(index + 1).")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.white.opacity(0.4))
                                .frame(width: 22, alignment: .trailing)
                            Text(word)
                                .font(.system(.subheadline, design: .monospaced, weight: .medium))
                                .foregroundStyle(.white)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 10)
                        .background(VaultOnyx.fieldBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(.horizontal, 16)

                // Warning
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                    Text("Do NOT share this phrase with ANYONE.")
                        .font(.caption.bold())
                        .foregroundStyle(.red.opacity(0.9))
                }
                .padding(.vertical, 12)

                Button {
                    withAnimation { step = .password }
                } label: {
                    Text("I've Written It Down")
                        .primaryButton()
                }
                .padding(.horizontal, VaultOnyx.horizontalPadding)
                .padding(.bottom, VaultOnyx.bottomPadding)
            }
        }
    }

    // MARK: - Step 3: Master Password

    private var passwordStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "lock.fill")
                .font(.system(size: 48))
                .foregroundStyle(VaultOnyx.iconGradient)

            VStack(spacing: 8) {
                Text("Set Master Password")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

                Text("Optional for server sync. Your seed phrase is the primary recovery method.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            // Password fields with strength indicator
            VStack(spacing: 12) {
                SecureField("Master Password", text: $masterPassword)
                    .textContentType(.newPassword)
                    .darkField()

                // Strength indicator
                if !masterPassword.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(0..<4, id: \.self) { i in
                            RoundedRectangle(cornerRadius: 2)
                                .fill(i < passwordStrength.level ? passwordStrength.color : Color.white.opacity(0.1))
                                .frame(height: 4)
                        }
                        Text(passwordStrength.label)
                            .font(.caption2.bold())
                            .foregroundStyle(passwordStrength.color)
                            .frame(width: 50, alignment: .trailing)
                    }
                    .padding(.horizontal, 4)
                }

                SecureField("Confirm Password", text: $confirmPassword)
                    .textContentType(.newPassword)
                    .darkField()
            }
            .padding(.horizontal, VaultOnyx.horizontalPadding)

            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.9))
            }

            Spacer()

            Button {
                createVault()
            } label: {
                Text("Create Vault")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, VaultOnyx.buttonPadding)
                    .background(canCreate ? VaultOnyx.accentBlue : Color.white.opacity(0.1))
                    .foregroundStyle(canCreate ? .white : .white.opacity(0.3))
                    .clipShape(RoundedRectangle(cornerRadius: VaultOnyx.cornerRadius))
            }
            .disabled(!canCreate)
            .padding(.horizontal, VaultOnyx.horizontalPadding)
            .padding(.bottom, VaultOnyx.bottomPadding)
        }
    }

    // MARK: - Password Strength

    private var passwordStrength: (level: Int, label: String, color: Color) {
        let len = masterPassword.count
        if len < 6 { return (1, "Weak", .red) }
        var score = 0
        if len >= 8 { score += 1 }
        if len >= 12 { score += 1 }
        if masterPassword.rangeOfCharacter(from: .uppercaseLetters) != nil { score += 1 }
        if masterPassword.rangeOfCharacter(from: .decimalDigits) != nil { score += 1 }
        if masterPassword.rangeOfCharacter(from: .punctuationCharacters) != nil ||
           masterPassword.rangeOfCharacter(from: .symbols) != nil { score += 1 }
        switch score {
        case 0...1: return (1, "Weak", .red)
        case 2: return (2, "Fair", .orange)
        case 3: return (3, "Good", .yellow)
        default: return (4, "Strong", .green)
        }
    }

    private var canCreate: Bool {
        !masterPassword.isEmpty && masterPassword == confirmPassword
    }

    private func createVault() {
        do {
            try appState.createVault(mnemonic: mnemonic, masterPassword: masterPassword)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
