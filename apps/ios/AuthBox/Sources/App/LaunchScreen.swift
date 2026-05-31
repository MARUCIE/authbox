import SwiftUI

/// Custom launch screen matching the dark Vault Onyx theme.
struct LaunchScreen: View {
    var body: some View {
        ZStack {
            VaultOnyx.darkBackground.ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 56, weight: .light))
                    .foregroundStyle(VaultOnyx.iconGradient)

                Text("Auth Box")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
    }
}
