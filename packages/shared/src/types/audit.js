export var ActorType;
(function (ActorType) {
    ActorType["User"] = "user";
    ActorType["Agent"] = "agent";
    ActorType["System"] = "system";
})(ActorType || (ActorType = {}));
export var AuditAction;
(function (AuditAction) {
    // Auth events
    AuditAction["UserRegister"] = "user.register";
    AuditAction["UserLogin"] = "user.login";
    AuditAction["UserLogout"] = "user.logout";
    AuditAction["UserPasswordChange"] = "user.password_change";
    AuditAction["SessionCreate"] = "session.create";
    AuditAction["SessionRevoke"] = "session.revoke";
    // Vault events
    AuditAction["VaultItemCreate"] = "vault.item.create";
    AuditAction["VaultItemRead"] = "vault.item.read";
    AuditAction["VaultItemUpdate"] = "vault.item.update";
    AuditAction["VaultItemDelete"] = "vault.item.delete";
    AuditAction["VaultSync"] = "vault.sync";
    // Agent events
    AuditAction["AgentCreate"] = "agent.create";
    AuditAction["AgentAccess"] = "agent.access";
    AuditAction["AgentPolicyChange"] = "agent.policy_change";
    AuditAction["AgentSuspend"] = "agent.suspend";
    AuditAction["AgentRevoke"] = "agent.revoke";
    // Connection events
    AuditAction["ConnectionCreate"] = "connection.create";
    AuditAction["ConnectionRefresh"] = "connection.refresh";
    AuditAction["ConnectionRevoke"] = "connection.revoke";
    // Gateway events
    AuditAction["GatewayRequest"] = "gateway.request";
    AuditAction["GatewayDenied"] = "gateway.denied";
    AuditAction["GatewayProxied"] = "gateway.proxied";
})(AuditAction || (AuditAction = {}));
export var AuditDecision;
(function (AuditDecision) {
    AuditDecision["Allow"] = "allow";
    AuditDecision["Deny"] = "deny";
    AuditDecision["StepUp"] = "step_up";
    AuditDecision["Error"] = "error";
})(AuditDecision || (AuditDecision = {}));
//# sourceMappingURL=audit.js.map