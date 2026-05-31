import SwiftUI
import AuthBoxCrypto

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @State private var showCreate = false
    @State private var showRestore = false
    @State private var shieldScale = 0.8
    @State private var glowOpacity = 0.0

    var body: some View {
        NavigationStack {
            ZStack {
                VaultOnyx.darkBackground.ignoresSafeArea()

                VStack(spacing: 36) {
                    Spacer()

                    // Shield icon with glow
                    ZStack {
                        // Glow rings
                        Circle()
                            .fill(Color.blue.opacity(0.08))
                            .frame(width: 180, height: 180)
                        Circle()
                            .fill(Color.blue.opacity(0.05))
                            .frame(width: 220, height: 220)
                        Circle()
                            .stroke(Color.blue.opacity(glowOpacity * 0.3), lineWidth: 1)
                            .frame(width: 160, height: 160)

                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 72, weight: .light))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [.blue.opacity(0.7), .blue],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                            .scaleEffect(shieldScale)
                    }

                    // Title
                    VStack(spacing: 8) {
                        Text("Auth Box")
                            .font(.system(size: 36, weight: .bold, design: .default))
                            .foregroundStyle(.white)

                        Text("Your Keys. Your Identity. Unstoppable.")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.6))
                    }

                    // Feature bullets
                    VStack(alignment: .leading, spacing: 14) {
                        FeatureRow(icon: "key.fill", text: "24 words = all your passwords")
                        FeatureRow(icon: "wifi.slash", text: "Works offline, no server needed")
                        FeatureRow(icon: "faceid", text: "Face ID / Touch ID unlock")
                        FeatureRow(icon: "arrow.triangle.2.circlepath", text: "Import from 13 password managers")
                    }
                    .padding(.horizontal, 36)

                    Spacer()

                    // Action buttons
                    VStack(spacing: 12) {
                        Button {
                            showCreate = true
                        } label: {
                            Text("Create New Vault")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                        }
                        .background(Color.blue)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .accessibilityLabel("Create new vault")
                        .accessibilityHint("Generate a new seed phrase and set up your password vault")

                        Button {
                            showRestore = true
                        } label: {
                            Text("Restore from Seed Phrase")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                        }
                        .background(.white.opacity(0.08))
                        .foregroundStyle(.white.opacity(0.9))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(.white.opacity(0.2), lineWidth: 1)
                        )
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 20)
                }
            }
            .onAppear {
                withAnimation(.easeOut(duration: 0.8)) {
                    shieldScale = 1.0
                    glowOpacity = 1.0
                }
            }
            .fullScreenCover(isPresented: $showCreate) {
                CreateVaultView()
            }
            .fullScreenCover(isPresented: $showRestore) {
                RestoreVaultView()
            }
        }
    }
}

private struct FeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .frame(width: 28)
                .foregroundStyle(.blue)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.85))
        }
    }
}
