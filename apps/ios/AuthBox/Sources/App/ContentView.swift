import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        // Visual-acceptance seam: when the Send-demo launch arg set a pending
        // descriptor, present the Send sheet straight at the root. Stays nil in
        // release (no writer), so production always falls through to the vault UI.
        if let demo = appState.pendingSendDemo {
            SendWalletView(descriptor: demo,
                           initialTo: "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl",
                           initialAmount: "0.00001",
                           autoReview: true)
        } else {
            switch appState.vaultState {
            case .empty:
                OnboardingView()
            case .locked:
                UnlockView()
            case .unlocked:
                VaultListView()
            }
        }
    }
}
