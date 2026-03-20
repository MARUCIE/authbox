import { z } from 'zod';
export declare const KDFParamsSchema: z.ZodObject<{
    algorithm: z.ZodLiteral<"argon2id">;
    memory: z.ZodNumber;
    iterations: z.ZodNumber;
    parallelism: z.ZodNumber;
    keyLength: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    algorithm: "argon2id";
    memory: number;
    iterations: number;
    parallelism: number;
    keyLength: number;
}, {
    algorithm: "argon2id";
    memory: number;
    iterations: number;
    parallelism: number;
    keyLength: number;
}>;
export declare const SRPRegisterRequestSchema: z.ZodObject<{
    email: z.ZodString;
    srpSalt: z.ZodString;
    srpVerifier: z.ZodString;
    encryptedVaultKey: z.ZodString;
    vaultKeyNonce: z.ZodString;
    vaultKeyTag: z.ZodString;
    kdfParams: z.ZodObject<{
        algorithm: z.ZodLiteral<"argon2id">;
        memory: z.ZodNumber;
        iterations: z.ZodNumber;
        parallelism: z.ZodNumber;
        keyLength: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        algorithm: "argon2id";
        memory: number;
        iterations: number;
        parallelism: number;
        keyLength: number;
    }, {
        algorithm: "argon2id";
        memory: number;
        iterations: number;
        parallelism: number;
        keyLength: number;
    }>;
    publicKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    srpSalt: string;
    srpVerifier: string;
    encryptedVaultKey: string;
    vaultKeyNonce: string;
    vaultKeyTag: string;
    kdfParams: {
        algorithm: "argon2id";
        memory: number;
        iterations: number;
        parallelism: number;
        keyLength: number;
    };
    publicKey?: string | undefined;
}, {
    email: string;
    srpSalt: string;
    srpVerifier: string;
    encryptedVaultKey: string;
    vaultKeyNonce: string;
    vaultKeyTag: string;
    kdfParams: {
        algorithm: "argon2id";
        memory: number;
        iterations: number;
        parallelism: number;
        keyLength: number;
    };
    publicKey?: string | undefined;
}>;
export declare const SRPLoginInitRequestSchema: z.ZodObject<{
    email: z.ZodString;
    clientPublicA: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    clientPublicA: string;
}, {
    email: string;
    clientPublicA: string;
}>;
export declare const SRPLoginVerifyRequestSchema: z.ZodObject<{
    email: z.ZodString;
    clientProofM1: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    clientProofM1: string;
}, {
    email: string;
    clientProofM1: string;
}>;
export declare const VaultItemSchema: z.ZodDiscriminatedUnion<"itemType", [z.ZodObject<{
    itemType: z.ZodLiteral<"login">;
    uri: z.ZodArray<z.ZodString, "many">;
    username: z.ZodString;
    password: z.ZodString;
    totpSecret: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    vaultId: z.ZodString;
    name: z.ZodString;
    folderId: z.ZodOptional<z.ZodString>;
    favorite: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    revision: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    itemType: "login";
    uri: string[];
    username: string;
    password: string;
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    totpSecret?: string | undefined;
    notes?: string | undefined;
    folderId?: string | undefined;
}, {
    itemType: "login";
    uri: string[];
    username: string;
    password: string;
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    totpSecret?: string | undefined;
    notes?: string | undefined;
    folderId?: string | undefined;
}>, z.ZodObject<{
    itemType: z.ZodLiteral<"api_key">;
    service: z.ZodString;
    keyName: z.ZodString;
    keyValue: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    vaultId: z.ZodString;
    name: z.ZodString;
    folderId: z.ZodOptional<z.ZodString>;
    favorite: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    revision: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    itemType: "api_key";
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    service: string;
    keyName: string;
    keyValue: string;
    notes?: string | undefined;
    folderId?: string | undefined;
    expiresAt?: string | undefined;
}, {
    itemType: "api_key";
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    service: string;
    keyName: string;
    keyValue: string;
    notes?: string | undefined;
    folderId?: string | undefined;
    expiresAt?: string | undefined;
}>, z.ZodObject<{
    itemType: z.ZodLiteral<"secure_note">;
    content: z.ZodString;
    id: z.ZodString;
    vaultId: z.ZodString;
    name: z.ZodString;
    folderId: z.ZodOptional<z.ZodString>;
    favorite: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    revision: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    itemType: "secure_note";
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    content: string;
    folderId?: string | undefined;
}, {
    itemType: "secure_note";
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    content: string;
    folderId?: string | undefined;
}>, z.ZodObject<{
    itemType: z.ZodLiteral<"identity">;
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodObject<{
        street: z.ZodString;
        city: z.ZodString;
        state: z.ZodString;
        zip: z.ZodString;
        country: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    }, {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    }>>;
    id: z.ZodString;
    vaultId: z.ZodString;
    name: z.ZodString;
    folderId: z.ZodOptional<z.ZodString>;
    favorite: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    revision: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    itemType: "identity";
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    firstName: string;
    lastName: string;
    email?: string | undefined;
    folderId?: string | undefined;
    phone?: string | undefined;
    address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    } | undefined;
}, {
    itemType: "identity";
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    firstName: string;
    lastName: string;
    email?: string | undefined;
    folderId?: string | undefined;
    phone?: string | undefined;
    address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    } | undefined;
}>, z.ZodObject<{
    itemType: z.ZodLiteral<"card">;
    cardholderName: z.ZodString;
    number: z.ZodString;
    expMonth: z.ZodString;
    expYear: z.ZodString;
    cvv: z.ZodString;
    brand: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    vaultId: z.ZodString;
    name: z.ZodString;
    folderId: z.ZodOptional<z.ZodString>;
    favorite: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    revision: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    number: string;
    itemType: "card";
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    cardholderName: string;
    expMonth: string;
    expYear: string;
    cvv: string;
    folderId?: string | undefined;
    brand?: string | undefined;
}, {
    number: string;
    itemType: "card";
    id: string;
    vaultId: string;
    name: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revision: number;
    cardholderName: string;
    expMonth: string;
    expYear: string;
    cvv: string;
    folderId?: string | undefined;
    brand?: string | undefined;
}>]>;
export declare const EncryptedVaultItemSchema: z.ZodObject<{
    id: z.ZodString;
    vaultId: z.ZodString;
    itemType: z.ZodEnum<["login", "api_key", "secure_note", "identity", "card"]>;
    encryptedData: z.ZodString;
    nonce: z.ZodString;
    tag: z.ZodString;
    uriHash: z.ZodOptional<z.ZodString>;
    revision: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    itemType: "login" | "api_key" | "secure_note" | "identity" | "card";
    id: string;
    vaultId: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
    encryptedData: string;
    nonce: string;
    tag: string;
    uriHash?: string | undefined;
}, {
    itemType: "login" | "api_key" | "secure_note" | "identity" | "card";
    id: string;
    vaultId: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
    encryptedData: string;
    nonce: string;
    tag: string;
    uriHash?: string | undefined;
}>;
export declare const VaultSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    name: z.ZodString;
    vaultType: z.ZodEnum<["personal", "shared"]>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    vaultType: "personal" | "shared";
}, {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    vaultType: "personal" | "shared";
}>;
export declare const AgentSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    name: z.ZodString;
    agentType: z.ZodEnum<["claude", "chatgpt", "gemini", "custom"]>;
    apiKeyHash: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["active", "suspended", "revoked"]>;
    lastAccessAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "active" | "suspended" | "revoked";
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    agentType: "claude" | "chatgpt" | "gemini" | "custom";
    apiKeyHash: string;
    description?: string | undefined;
    lastAccessAt?: string | undefined;
}, {
    status: "active" | "suspended" | "revoked";
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    agentType: "claude" | "chatgpt" | "gemini" | "custom";
    apiKeyHash: string;
    description?: string | undefined;
    lastAccessAt?: string | undefined;
}>;
export declare const PolicyRulesSchema: z.ZodObject<{
    allowedItemTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<["login", "api_key", "secure_note", "identity", "card"]>, "many">>;
    allowedItemIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    allowedFolderIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    deniedItemIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    allowedActions: z.ZodOptional<z.ZodArray<z.ZodEnum<["read", "use", "proxy"]>, "many">>;
    maxRequests: z.ZodOptional<z.ZodNumber>;
    windowSeconds: z.ZodOptional<z.ZodNumber>;
    allowedHours: z.ZodOptional<z.ZodObject<{
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        start: number;
        end: number;
    }, {
        start: number;
        end: number;
    }>>;
    allowedDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    requireApproval: z.ZodOptional<z.ZodBoolean>;
    approvalTimeoutSeconds: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    allowedItemTypes?: ("login" | "api_key" | "secure_note" | "identity" | "card")[] | undefined;
    allowedItemIds?: string[] | undefined;
    allowedFolderIds?: string[] | undefined;
    deniedItemIds?: string[] | undefined;
    allowedActions?: ("read" | "use" | "proxy")[] | undefined;
    maxRequests?: number | undefined;
    windowSeconds?: number | undefined;
    allowedHours?: {
        start: number;
        end: number;
    } | undefined;
    allowedDays?: number[] | undefined;
    requireApproval?: boolean | undefined;
    approvalTimeoutSeconds?: number | undefined;
}, {
    allowedItemTypes?: ("login" | "api_key" | "secure_note" | "identity" | "card")[] | undefined;
    allowedItemIds?: string[] | undefined;
    allowedFolderIds?: string[] | undefined;
    deniedItemIds?: string[] | undefined;
    allowedActions?: ("read" | "use" | "proxy")[] | undefined;
    maxRequests?: number | undefined;
    windowSeconds?: number | undefined;
    allowedHours?: {
        start: number;
        end: number;
    } | undefined;
    allowedDays?: number[] | undefined;
    requireApproval?: boolean | undefined;
    approvalTimeoutSeconds?: number | undefined;
}>;
export declare const AgentPolicySchema: z.ZodObject<{
    id: z.ZodString;
    agentId: z.ZodString;
    policyType: z.ZodEnum<["item_scope", "action_perm", "rate_limit", "time_window", "step_up"]>;
    rules: z.ZodObject<{
        allowedItemTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<["login", "api_key", "secure_note", "identity", "card"]>, "many">>;
        allowedItemIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowedFolderIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        deniedItemIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowedActions: z.ZodOptional<z.ZodArray<z.ZodEnum<["read", "use", "proxy"]>, "many">>;
        maxRequests: z.ZodOptional<z.ZodNumber>;
        windowSeconds: z.ZodOptional<z.ZodNumber>;
        allowedHours: z.ZodOptional<z.ZodObject<{
            start: z.ZodNumber;
            end: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            start: number;
            end: number;
        }, {
            start: number;
            end: number;
        }>>;
        allowedDays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        requireApproval: z.ZodOptional<z.ZodBoolean>;
        approvalTimeoutSeconds: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        allowedItemTypes?: ("login" | "api_key" | "secure_note" | "identity" | "card")[] | undefined;
        allowedItemIds?: string[] | undefined;
        allowedFolderIds?: string[] | undefined;
        deniedItemIds?: string[] | undefined;
        allowedActions?: ("read" | "use" | "proxy")[] | undefined;
        maxRequests?: number | undefined;
        windowSeconds?: number | undefined;
        allowedHours?: {
            start: number;
            end: number;
        } | undefined;
        allowedDays?: number[] | undefined;
        requireApproval?: boolean | undefined;
        approvalTimeoutSeconds?: number | undefined;
    }, {
        allowedItemTypes?: ("login" | "api_key" | "secure_note" | "identity" | "card")[] | undefined;
        allowedItemIds?: string[] | undefined;
        allowedFolderIds?: string[] | undefined;
        deniedItemIds?: string[] | undefined;
        allowedActions?: ("read" | "use" | "proxy")[] | undefined;
        maxRequests?: number | undefined;
        windowSeconds?: number | undefined;
        allowedHours?: {
            start: number;
            end: number;
        } | undefined;
        allowedDays?: number[] | undefined;
        requireApproval?: boolean | undefined;
        approvalTimeoutSeconds?: number | undefined;
    }>;
    scopeFilter: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    updatedAt: string;
    agentId: string;
    policyType: "item_scope" | "action_perm" | "rate_limit" | "time_window" | "step_up";
    rules: {
        allowedItemTypes?: ("login" | "api_key" | "secure_note" | "identity" | "card")[] | undefined;
        allowedItemIds?: string[] | undefined;
        allowedFolderIds?: string[] | undefined;
        deniedItemIds?: string[] | undefined;
        allowedActions?: ("read" | "use" | "proxy")[] | undefined;
        maxRequests?: number | undefined;
        windowSeconds?: number | undefined;
        allowedHours?: {
            start: number;
            end: number;
        } | undefined;
        allowedDays?: number[] | undefined;
        requireApproval?: boolean | undefined;
        approvalTimeoutSeconds?: number | undefined;
    };
    scopeFilter?: string | undefined;
}, {
    id: string;
    createdAt: string;
    updatedAt: string;
    agentId: string;
    policyType: "item_scope" | "action_perm" | "rate_limit" | "time_window" | "step_up";
    rules: {
        allowedItemTypes?: ("login" | "api_key" | "secure_note" | "identity" | "card")[] | undefined;
        allowedItemIds?: string[] | undefined;
        allowedFolderIds?: string[] | undefined;
        deniedItemIds?: string[] | undefined;
        allowedActions?: ("read" | "use" | "proxy")[] | undefined;
        maxRequests?: number | undefined;
        windowSeconds?: number | undefined;
        allowedHours?: {
            start: number;
            end: number;
        } | undefined;
        allowedDays?: number[] | undefined;
        requireApproval?: boolean | undefined;
        approvalTimeoutSeconds?: number | undefined;
    };
    scopeFilter?: string | undefined;
}>;
export declare const AuthConnectionSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    provider: z.ZodString;
    providerAccountId: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["active", "expired", "revoked", "error"]>;
    scopes: z.ZodArray<z.ZodString, "many">;
    accessTokenEnc: z.ZodString;
    refreshTokenEnc: z.ZodOptional<z.ZodString>;
    tokenNonce: z.ZodString;
    tokenTag: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "active" | "revoked" | "expired" | "error";
    id: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    provider: string;
    scopes: string[];
    accessTokenEnc: string;
    tokenNonce: string;
    tokenTag: string;
    expiresAt?: string | undefined;
    providerAccountId?: string | undefined;
    refreshTokenEnc?: string | undefined;
}, {
    status: "active" | "revoked" | "expired" | "error";
    id: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    provider: string;
    scopes: string[];
    accessTokenEnc: string;
    tokenNonce: string;
    tokenTag: string;
    expiresAt?: string | undefined;
    providerAccountId?: string | undefined;
    refreshTokenEnc?: string | undefined;
}>;
export declare const AuditQuerySchema: z.ZodObject<{
    actorType: z.ZodOptional<z.ZodEnum<["user", "agent", "system"]>>;
    actorId: z.ZodOptional<z.ZodString>;
    action: z.ZodOptional<z.ZodEnum<["user.register", "user.login", "user.logout", "user.password_change", "session.create", "session.revoke", "vault.item.create", "vault.item.read", "vault.item.update", "vault.item.delete", "vault.sync", "agent.create", "agent.access", "agent.policy_change", "agent.suspend", "agent.revoke", "connection.create", "connection.refresh", "connection.revoke", "gateway.request", "gateway.denied", "gateway.proxied"]>>;
    resourceType: z.ZodOptional<z.ZodString>;
    resourceId: z.ZodOptional<z.ZodString>;
    decision: z.ZodOptional<z.ZodEnum<["allow", "deny", "step_up", "error"]>>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    actorType?: "user" | "agent" | "system" | undefined;
    actorId?: string | undefined;
    action?: "user.register" | "user.login" | "user.logout" | "user.password_change" | "session.create" | "session.revoke" | "vault.item.create" | "vault.item.read" | "vault.item.update" | "vault.item.delete" | "vault.sync" | "agent.create" | "agent.access" | "agent.policy_change" | "agent.suspend" | "agent.revoke" | "connection.create" | "connection.refresh" | "connection.revoke" | "gateway.request" | "gateway.denied" | "gateway.proxied" | undefined;
    resourceType?: string | undefined;
    resourceId?: string | undefined;
    decision?: "step_up" | "error" | "allow" | "deny" | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}, {
    actorType?: "user" | "agent" | "system" | undefined;
    actorId?: string | undefined;
    action?: "user.register" | "user.login" | "user.logout" | "user.password_change" | "session.create" | "session.revoke" | "vault.item.create" | "vault.item.read" | "vault.item.update" | "vault.item.delete" | "vault.sync" | "agent.create" | "agent.access" | "agent.policy_change" | "agent.suspend" | "agent.revoke" | "connection.create" | "connection.refresh" | "connection.revoke" | "gateway.request" | "gateway.denied" | "gateway.proxied" | undefined;
    resourceType?: string | undefined;
    resourceId?: string | undefined;
    decision?: "step_up" | "error" | "allow" | "deny" | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}>;
export type ValidatedSRPRegisterRequest = z.infer<typeof SRPRegisterRequestSchema>;
export type ValidatedSRPLoginInitRequest = z.infer<typeof SRPLoginInitRequestSchema>;
export type ValidatedSRPLoginVerifyRequest = z.infer<typeof SRPLoginVerifyRequestSchema>;
export type ValidatedVaultItem = z.infer<typeof VaultItemSchema>;
export type ValidatedEncryptedVaultItem = z.infer<typeof EncryptedVaultItemSchema>;
export type ValidatedAgent = z.infer<typeof AgentSchema>;
export type ValidatedAgentPolicy = z.infer<typeof AgentPolicySchema>;
export type ValidatedAuthConnection = z.infer<typeof AuthConnectionSchema>;
export type ValidatedAuditQuery = z.infer<typeof AuditQuerySchema>;
//# sourceMappingURL=index.d.ts.map