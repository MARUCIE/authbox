//
//  MenuBarContent.swift
//  Menu-bar broker surface. P0 establishes the shell; P4 fills in pending
//  agent-credential requests + one-tap consent.
//

import SwiftUI

struct MenuBarContent: View {
    @EnvironmentObject private var lockState: VaultSession

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: lockState.isUnlocked ? "lock.open.fill" : "lock.fill")
                    .foregroundStyle(lockState.isUnlocked ? .green : .secondary)
                Text(lockState.isUnlocked ? "Unlocked" : "Locked")
                    .font(.headline)
                Spacer()
            }

            Divider()

            if lockState.isUnlocked {
                // P4: pending agent requests appear here as consent cards.
                Text("No pending agent requests")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Button {
                    lockState.lock()
                } label: {
                    Label("Lock all", systemImage: "lock.fill")
                }
            } else {
                Button {
                    lockState.unlock()
                } label: {
                    Label("Unlock with Touch ID", systemImage: "touchid")
                }
            }

            Divider()

            Button("Quit Auth Box") {
                NSApplication.shared.terminate(nil)
            }
        }
        .padding(12)
        .frame(width: 280)
    }
}
