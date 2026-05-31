import SwiftUI
import LocalAuthentication

struct UnlockView: View {
    @EnvironmentObject var appState: AppState
    @State private var error: String?
    @State private var isAuthenticating = false
    @State private var pulseScale = 1.0
    @State private var ringOpacity = 0.0

    var body: some View {
        ZStack {
            VaultOnyx.darkBackground.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                // Lock icon
                Image(systemName: "lock.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.white.opacity(0.5))

                Text("Auth Box")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(.white)

                Text("Vault Locked")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.5))

                Spacer()

                // Face ID with pulse rings
                ZStack {
                    // Animated pulse rings
                    ForEach(0..<4, id: \.self) { i in
                        Circle()
                            .stroke(Color.blue.opacity(ringOpacity * (0.3 - Double(i) * 0.06)), lineWidth: 1)
                            .frame(width: CGFloat(120 + i * 40), height: CGFloat(120 + i * 40))
                            .scaleEffect(pulseScale)
                    }

                    // Face ID icon
                    Image(systemName: "faceid")
                        .font(.system(size: 56, weight: .thin))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .frame(height: 280)

                Spacer()

                if let error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red.opacity(0.9))
                        .padding(.horizontal)
                }

                Button {
                    unlockWithBiometrics()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "faceid")
                        Text("Unlock with Face ID")
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                }
                .background(Color.blue)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .disabled(isAuthenticating)
                .padding(.horizontal, 24)
                .padding(.bottom, 20)
                .accessibilityLabel("Unlock vault with Face ID")
                .accessibilityHint("Authenticate with biometrics to access your passwords")
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                pulseScale = 1.08
            }
            withAnimation(.easeIn(duration: 1.0)) {
                ringOpacity = 1.0
            }
            unlockWithBiometrics()
        }
    }

    private func unlockWithBiometrics() {
        isAuthenticating = true
        error = nil

        Task {
            do {
                let seed = try KeychainManager.retrieveSeed()
                try appState.unlockVault(withBiometrics: seed)
            } catch {
                self.error = error.localizedDescription
            }
            isAuthenticating = false
        }
    }
}
