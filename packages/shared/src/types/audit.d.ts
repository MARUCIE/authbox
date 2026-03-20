export declare enum ActorType {
    User = "user",
    Agent = "agent",
    System = "system"
}
export declare enum AuditAction {
    UserRegister = "user.register",
    UserLogin = "user.login",
    UserLogout = "user.logout",
    UserPasswordChange = "user.password_change",
    SessionCreate = "session.create",
    SessionRevoke = "session.revoke",
    VaultItemCreate = "vault.item.create",
    VaultItemRead = "vault.item.read",
    VaultItemUpdate = "vault.item.update",
    VaultItemDelete = "vault.item.delete",
    VaultSync = "vault.sync",
    AgentCreate = "agent.create",
    AgentAccess = "agent.access",
    AgentPolicyChange = "agent.policy_change",
    AgentSuspend = "agent.suspend",
    AgentRevoke = "agent.revoke",
    ConnectionCreate = "connection.create",
    ConnectionRefresh = "connection.refresh",
    ConnectionRevoke = "connection.revoke",
    GatewayRequest = "gateway.request",
    GatewayDenied = "gateway.denied",
    GatewayProxied = "gateway.proxied"
}
export declare enum AuditDecision {
    Allow = "allow",
    Deny = "deny",
    StepUp = "step_up",
    Error = "error"
}
export interface AuditEvent {
    id: string;
    actorType: ActorType;
    actorId: string;
    action: AuditAction;
    resourceType?: string;
    resourceId?: string;
    decision: AuditDecision;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    eventHash: string;
    prevEventHash: string;
    createdAt: string;
}
export interface AuditQuery {
    actorType?: ActorType;
    actorId?: string;
    action?: AuditAction;
    resourceType?: string;
    resourceId?: string;
    decision?: AuditDecision;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
export interface AuditExport {
    events: AuditEvent[];
    chainVerified: boolean;
    exportedAt: string;
    exportedBy: string;
}
//# sourceMappingURL=audit.d.ts.map