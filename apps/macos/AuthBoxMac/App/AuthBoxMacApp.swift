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
    /// P1: real session — Touch ID gate + Secure-Enclave-wrapped vault key,
    /// master key held in memory only while unlocked, zeroed on lock/sleep/idle.
    @StateObject private var session = VaultSession()

    var body: some Scene {
        WindowGroup("Auth Box") {
            RootView()
                .environmentObject(session)
                .frame(minWidth: 880, minHeight: 560)
        }
        .windowToolbarStyle(.unified)

        // Menu-bar broker surface: quick unlock + pending agent requests + lock-all.
        MenuBarExtra("Auth Box", systemImage: session.isUnlocked ? "lock.open.fill" : "lock.fill") {
            MenuBarContent()
                .environmentObject(session)
        }
        .menuBarExtraStyle(.window)
    }
}
