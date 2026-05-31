import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
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
