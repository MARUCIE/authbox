//
//  AuthBoxMacApp.swift
//  Auth Box for Mac — native macOS app entry point.
//
//  Fuses three credential surfaces behind one Touch-ID-gated local broker:
//    1. password vault   2. AI provider hub   3. agent-authorization broker
//  Architecture: doc/10_features/macos-native-app/ARCHITECTURE.md
//
//  P0 scaffold: main window + menu-bar extra, linking the shared AuthBoxCrypto
//  package. Auth core (Touch ID / Secure Enclave) lands in P1.
//

import SwiftUI
import AuthBoxCrypto  // shared cross-platform crypto core — proves the SwiftPM link

@main
struct AuthBoxMacApp: App {
    /// Vault lock state. P0 is a stub; P1 wires it to LocalAuthentication +
    /// a Secure-Enclave-wrapped vault key.
    @StateObject private var lockState = LockState()

    var body: some Scene {
        WindowGroup("Auth Box") {
            RootView()
                .environmentObject(lockState)
                .frame(minWidth: 880, minHeight: 560)
        }
        .windowToolbarStyle(.unified)

        // Menu-bar broker surface: quick unlock + pending agent requests + lock-all.
        MenuBarExtra("Auth Box", systemImage: lockState.isUnlocked ? "lock.open.fill" : "lock.fill") {
            MenuBarContent()
                .environmentObject(lockState)
        }
        .menuBarExtraStyle(.window)
    }
}

/// Minimal lock-state model. The real implementation (P1) holds the in-memory
/// vault master key only while unlocked and zeroes it on lock/sleep.
@MainActor
final class LockState: ObservableObject {
    @Published private(set) var isUnlocked: Bool = false

    /// P0 stub. P1 replaces this with LAContext.evaluatePolicy(...) +
    /// Secure-Enclave key unwrap. Deny-by-default: stays locked on any failure.
    func unlock() {
        // P1: Touch ID gate goes here.
        isUnlocked = true
    }

    func lock() {
        // P1: zero the in-memory master key here.
        isUnlocked = false
    }
}
