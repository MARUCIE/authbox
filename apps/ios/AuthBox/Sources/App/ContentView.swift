import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        // Visual-acceptance seam: when the Send-demo launch arg set a pending
        // descriptor, present the Send sheet straight at the root. Stays nil in
        // release (no writer), so production always falls through to the vault UI.
        if let demo = appState.pendingSendDemo {
            let isBtc = demo.coin == "btc"
            // --send-demo-noreview stops at the input form (no auto-review) so the
            // compose stage — including the available-balance footer — is itself
            // screenshot-able without the sheet jumping straight to Review.
            let args = ProcessInfo.processInfo.arguments
            let autoReview = !args.contains("--send-demo-noreview")
            // Testnet-only end-to-end broadcast walkthrough (SendWalletView guards
            // isTestnet again, so this can never broadcast on mainnet).
            let autoBroadcast = args.contains("--send-demo-broadcast")
            SendWalletView(
                descriptor: demo,
                initialTo: isBtc
                    ? "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl"
                    : "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
                initialAmount: isBtc ? "0.00001" : "0.001",
                autoReview: autoReview,
                autoBroadcast: autoBroadcast)
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
