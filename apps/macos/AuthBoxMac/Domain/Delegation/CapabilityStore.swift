//
//  CapabilityStore.swift
//  P4 — restart-durable persistence for granted agent capabilities.
//
//  Without this, AuthorizationCenter.capabilities is in-memory only: every wired
//  agent evaporates on app relaunch, so the bearer token an operator copied at
//  grant time stops authenticating. That makes "wire an AI agent" a single-session
//  promise. This store closes that gap so an agent stays connected across restarts.
//
//  Trust model (mirrors AuditLog): plaintext JSON in the app's Application Support
//  container. Safe because a capability persists ONLY the SHA-256 HASH of the
//  agent's bearer token (the /etc/shadow model — the plaintext token is shown once
//  at grant time and never stored) plus non-secret policy rules. No vault key is
//  involved, so capabilities load independent of vault-lock state: an agent can be
//  AUTHENTICATED (token-hash match) before the vault is unlocked, while actually
//  revealing a secret still requires the vault key — which this store never touches.
//

import Foundation

struct CapabilityStore {
    let url: URL

    /// Default on-disk home: Application Support/AuthBox/capabilities.json — the
    /// same directory and trust model as the audit chain.
    static func defaultStore() -> CapabilityStore? {
        let fm = FileManager.default
        guard let base = try? fm.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                     appropriateFor: nil, create: true) else { return nil }
        return CapabilityStore(url: base.appendingPathComponent("AuthBox/capabilities.json"))
    }

    func load() -> [AgentCapability] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([AgentCapability].self, from: data)) ?? []
    }

    /// Atomic write: a crash mid-save must never leave a truncated, undecodable
    /// file, which would silently drop EVERY wired agent on the next load — a
    /// failure worse than no persistence at all.
    func save(_ capabilities: [AgentCapability]) {
        let fm = FileManager.default
        try? fm.createDirectory(at: url.deletingLastPathComponent(),
                                withIntermediateDirectories: true)
        guard let data = try? JSONEncoder().encode(capabilities) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
