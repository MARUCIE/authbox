//
//  QuickConnectService.swift
//  P4 — one-click "import credentials + wire an AI agent" orchestration.
//
//  This invents no new mechanism. It chains three already-proven, individually
//  authorized steps into a single operator action:
//
//    1. import   — parse .env / JSON config and store each classified credential
//                  as an encrypted vault item (ProviderImportService → VaultService).
//    2. grant    — register ONE agent scoped (least privilege) to exactly the
//                  credential categories it just imported: read+use, rate-limited,
//                  step-up on every use (AuthorizationCenter.addScopedCapability).
//    3. connect  — the operator starts the loopback broker; the agent then presents
//                  its bearer token on every intent and is gated by the deny-by-default
//                  PolicyEngine + tamper-evident AuditLog.
//
//  Security boundary (deliberate): there is NO "import the whole macOS login
//  Keychain" path here. macOS gates per-item Keychain reads with its own Allow
//  prompt by design, and the product rule is "one Keychain, per-read authorization,
//  never bulk-export". QuickConnect imports from sources the operator hands it
//  (a file or pasted config) and never reaches into other apps' Keychain items.
//

import Foundation

/// What a grant issues: the agent's stable id plus its bearer token. The token is
/// returned exactly once (only its SHA-256 hash is persisted in the capability).
struct IssuedAgentGrant: Equatable {
    let agentId: String
    let token: String
}

/// The grant surface QuickConnect needs, kept as a Domain protocol so the
/// orchestrator does not depend on the Features-layer view model directly
/// (dependency inversion — `AuthorizationCenter` conforms below).
@MainActor
protocol AgentRegistering: AnyObject {
    @discardableResult
    func addScopedCapability(name: String,
                             allowedItemTypes: [String],
                             allowedActions: [AgentAction],
                             maxRequests: Int?,
                             windowSeconds: Int?,
                             requireStepUp: Bool) -> IssuedAgentGrant
}

@MainActor
final class QuickConnectService {

    /// The result of one connect: how many credentials landed in the vault, the
    /// agent that can now reach them, its one-time token, and the exact category
    /// scope the agent was granted (so the UI can show "this agent can read N
    /// AI-provider keys and nothing else").
    struct Outcome: Equatable {
        let importedCount: Int
        let agentId: String
        let token: String
        let scopedItemTypes: [String]
    }

    /// Default least-privilege envelope for a freshly connected agent.
    private let defaultMaxRequests = 60
    private let defaultWindowSeconds = 3600

    private let importer: ProviderImportService
    private let registrar: AgentRegistering

    init(importer: ProviderImportService, registrar: AgentRegistering) {
        self.importer = importer
        self.registrar = registrar
    }

    /// One click: import the credentials in `content`, then grant `agentName` an
    /// agent scoped to exactly the imported categories (read+use, rate-limited,
    /// step-up). The vault key is used only for the import and never retained here.
    @discardableResult
    func connect(content: String, agentName: String, vaultKey: Data) throws -> Outcome {
        let result = EnvParser.parseAndClassify(content)
        let importedCount = try importer.importCredentials(result, vaultKey: vaultKey)

        // Least privilege: the agent may reach ONLY the categories it imported,
        // not the rest of the vault (passwords, wallet, …). Order-stable + unique.
        // `GroupedCredential.categoryId` is non-optional (the grouping step defaults
        // an unmatched provider to "unknown"), so dedup operates on the value directly.
        var seen = Set<String>()
        var scopedItemTypes: [String] = []
        for cred in result.classified where seen.insert(cred.categoryId).inserted {
            scopedItemTypes.append(cred.categoryId)
        }

        let grant = registrar.addScopedCapability(
            name: agentName,
            allowedItemTypes: scopedItemTypes,
            allowedActions: [.read, .use],
            maxRequests: defaultMaxRequests,
            windowSeconds: defaultWindowSeconds,
            requireStepUp: true)

        return Outcome(importedCount: importedCount,
                       agentId: grant.agentId,
                       token: grant.token,
                       scopedItemTypes: scopedItemTypes)
    }
}

// AuthorizationCenter (Features layer) already implements `addScopedCapability`
// with this exact shape; the empty conformance wires it to the Domain protocol so
// QuickConnectService depends on the abstraction, not the view model.
extension AuthorizationCenter: AgentRegistering {}
