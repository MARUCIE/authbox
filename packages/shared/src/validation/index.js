import { z } from 'zod';
// ─── Shared primitives ──────────────────────────────────────────────
const uuid = z.string().uuid();
const base64 = z.string().min(1);
const isoDate = z.string().datetime({ offset: true });
// ─── KDF Params ─────────────────────────────────────────────────────
export const KDFParamsSchema = z.object({
    algorithm: z.literal('argon2id'),
    memory: z.number().int().positive(),
    iterations: z.number().int().positive(),
    parallelism: z.number().int().positive(),
    keyLength: z.number().int().positive(),
});
// ─── Auth: SRP ──────────────────────────────────────────────────────
export const SRPRegisterRequestSchema = z.object({
    email: z.string().email(),
    srpSalt: base64,
    srpVerifier: base64,
    encryptedVaultKey: base64,
    vaultKeyNonce: base64,
    vaultKeyTag: base64,
    kdfParams: KDFParamsSchema,
    publicKey: base64.optional(),
});
export const SRPLoginInitRequestSchema = z.object({
    email: z.string().email(),
    clientPublicA: base64,
});
export const SRPLoginVerifyRequestSchema = z.object({
    email: z.string().email(),
    clientProofM1: base64,
});
// ─── Vault items ────────────────────────────────────────────────────
const ItemTypeEnum = z.enum([
    'login',
    'api_key',
    'secure_note',
    'identity',
    'card',
]);
const vaultItemBase = {
    id: uuid,
    vaultId: uuid,
    name: z.string().min(1).max(500),
    folderId: uuid.optional(),
    favorite: z.boolean(),
    createdAt: isoDate,
    updatedAt: isoDate,
    revision: z.number().int().nonnegative(),
};
const AddressSchema = z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string(),
});
const LoginItemSchema = z.object({
    ...vaultItemBase,
    itemType: z.literal('login'),
    uri: z.array(z.string().url()).min(0),
    username: z.string(),
    password: z.string(),
    totpSecret: z.string().optional(),
    notes: z.string().optional(),
});
const ApiKeyItemSchema = z.object({
    ...vaultItemBase,
    itemType: z.literal('api_key'),
    service: z.string().min(1),
    keyName: z.string().min(1),
    keyValue: z.string().min(1),
    expiresAt: isoDate.optional(),
    notes: z.string().optional(),
});
const SecureNoteItemSchema = z.object({
    ...vaultItemBase,
    itemType: z.literal('secure_note'),
    content: z.string(),
});
const IdentityItemSchema = z.object({
    ...vaultItemBase,
    itemType: z.literal('identity'),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: AddressSchema.optional(),
});
const CardItemSchema = z.object({
    ...vaultItemBase,
    itemType: z.literal('card'),
    cardholderName: z.string().min(1),
    number: z.string().min(13).max(19),
    expMonth: z.string().regex(/^(0[1-9]|1[0-2])$/),
    expYear: z.string().regex(/^\d{4}$/),
    cvv: z.string().regex(/^\d{3,4}$/),
    brand: z.string().optional(),
});
export const VaultItemSchema = z.discriminatedUnion('itemType', [
    LoginItemSchema,
    ApiKeyItemSchema,
    SecureNoteItemSchema,
    IdentityItemSchema,
    CardItemSchema,
]);
export const EncryptedVaultItemSchema = z.object({
    id: uuid,
    vaultId: uuid,
    itemType: ItemTypeEnum,
    encryptedData: base64,
    nonce: base64,
    tag: base64,
    uriHash: base64.optional(),
    revision: z.number().int().nonnegative(),
    createdAt: isoDate,
    updatedAt: isoDate,
});
export const VaultSchema = z.object({
    id: uuid,
    userId: uuid,
    name: z.string().min(1).max(200),
    vaultType: z.enum(['personal', 'shared']),
    createdAt: isoDate,
    updatedAt: isoDate,
});
// ─── Agent ──────────────────────────────────────────────────────────
const AgentTypeEnum = z.enum(['claude', 'chatgpt', 'gemini', 'custom']);
const AgentStatusEnum = z.enum(['active', 'suspended', 'revoked']);
export const AgentSchema = z.object({
    id: uuid,
    userId: uuid,
    name: z.string().min(1).max(200),
    agentType: AgentTypeEnum,
    apiKeyHash: z.string().min(1),
    description: z.string().max(2000).optional(),
    status: AgentStatusEnum,
    lastAccessAt: isoDate.optional(),
    createdAt: isoDate,
    updatedAt: isoDate,
});
const PolicyTypeEnum = z.enum([
    'item_scope',
    'action_perm',
    'rate_limit',
    'time_window',
    'step_up',
]);
export const PolicyRulesSchema = z.object({
    allowedItemTypes: z.array(ItemTypeEnum).optional(),
    allowedItemIds: z.array(uuid).optional(),
    allowedFolderIds: z.array(uuid).optional(),
    deniedItemIds: z.array(uuid).optional(),
    allowedActions: z
        .array(z.enum(['read', 'use', 'proxy']))
        .optional(),
    maxRequests: z.number().int().positive().optional(),
    windowSeconds: z.number().int().positive().optional(),
    allowedHours: z
        .object({
        start: z.number().int().min(0).max(23),
        end: z.number().int().min(0).max(23),
    })
        .optional(),
    allowedDays: z
        .array(z.number().int().min(0).max(6))
        .optional(),
    requireApproval: z.boolean().optional(),
    approvalTimeoutSeconds: z.number().int().positive().optional(),
});
export const AgentPolicySchema = z.object({
    id: uuid,
    agentId: uuid,
    policyType: PolicyTypeEnum,
    rules: PolicyRulesSchema,
    scopeFilter: z.string().optional(),
    createdAt: isoDate,
    updatedAt: isoDate,
});
// ─── Auth Connection ────────────────────────────────────────────────
const ConnectionStatusEnum = z.enum([
    'active',
    'expired',
    'revoked',
    'error',
]);
export const AuthConnectionSchema = z.object({
    id: uuid,
    userId: uuid,
    provider: z.string().min(1),
    providerAccountId: z.string().optional(),
    status: ConnectionStatusEnum,
    scopes: z.array(z.string()),
    accessTokenEnc: base64,
    refreshTokenEnc: base64.optional(),
    tokenNonce: base64,
    tokenTag: base64,
    expiresAt: isoDate.optional(),
    createdAt: isoDate,
    updatedAt: isoDate,
});
// ─── Audit ──────────────────────────────────────────────────────────
const ActorTypeEnum = z.enum(['user', 'agent', 'system']);
const AuditActionEnum = z.enum([
    'user.register',
    'user.login',
    'user.logout',
    'user.password_change',
    'session.create',
    'session.revoke',
    'vault.item.create',
    'vault.item.read',
    'vault.item.update',
    'vault.item.delete',
    'vault.sync',
    'agent.create',
    'agent.access',
    'agent.policy_change',
    'agent.suspend',
    'agent.revoke',
    'connection.create',
    'connection.refresh',
    'connection.revoke',
    'gateway.request',
    'gateway.denied',
    'gateway.proxied',
]);
const AuditDecisionEnum = z.enum(['allow', 'deny', 'step_up', 'error']);
export const AuditQuerySchema = z.object({
    actorType: ActorTypeEnum.optional(),
    actorId: z.string().optional(),
    action: AuditActionEnum.optional(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    decision: AuditDecisionEnum.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    limit: z.number().int().positive().max(1000).optional(),
    offset: z.number().int().nonnegative().optional(),
});
//# sourceMappingURL=index.js.map