//
//  ProviderImportService.swift
//  P3 — bridges parsed .env credentials into the encrypted vault. Each grouped
//  provider credential becomes one provider-tagged VaultItemRecord; the multi-
//  field secret lives in VaultSecret.fields. Reuses VaultService end-to-end
//  (same encryption, same store) — no provider-specific storage path.
//

import Foundation

@MainActor
final class ProviderImportService {
    private let vault: VaultService
    init(vault: VaultService) { self.vault = vault }

    /// Encrypt and store each classified provider credential. Returns the count
    /// imported. The vault key is consumed per call (never retained).
    @discardableResult
    func importCredentials(_ result: EnvImportResult, vaultKey: Data) throws -> Int {
        for cred in result.classified {
            let primary = primaryValue(for: cred)
            let secret = VaultSecret(secret: primary,
                                     notes: "Imported from .env (\(cred.fields.count) field\(cred.fields.count == 1 ? "" : "s"))",
                                     fields: cred.fields)
            try vault.add(
                title: cred.providerName,
                username: "",
                urlString: CredentialCatalog.provider(cred.providerId)?.website ?? "",
                categoryId: cred.categoryId,
                providerId: cred.providerId,
                secret: secret,
                vaultKey: vaultKey
            )
        }
        return result.classified.count
    }

    /// The single representative value for the item's `secret` column: prefer the
    /// catalog's first secret-typed field, else any field.
    private func primaryValue(for cred: GroupedCredential) -> String {
        if let tmpl = CredentialCatalog.provider(cred.providerId) {
            for f in tmpl.fields where f.type == .secret {
                if let v = cred.fields[f.key], !v.isEmpty { return v }
            }
        }
        return cred.fields.values.first ?? ""
    }
}
