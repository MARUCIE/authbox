export enum ActorType {
  User = 'user',
  Agent = 'agent',
  System = 'system',
}

export enum AuditAction {
  // Auth events
  UserRegister = 'user.register',
  UserLogin = 'user.login',
  UserLogout = 'user.logout',
  UserPasswordChange = 'user.password_change',
  SessionCreate = 'session.create',
  SessionRevoke = 'session.revoke',

  // Vault events
  VaultItemCreate = 'vault.item.create',
  VaultItemRead = 'vault.item.read',
  VaultItemUpdate = 'vault.item.update',
  VaultItemDelete = 'vault.item.delete',
  VaultSync = 'vault.sync',

  // Agent events
  AgentCreate = 'agent.create',
  AgentAccess = 'agent.access',
  AgentPolicyChange = 'agent.policy_change',
  AgentSuspend = 'agent.suspend',
  AgentRevoke = 'agent.revoke',

  // Connection events
  ConnectionCreate = 'connection.create',
  ConnectionRefresh = 'connection.refresh',
  ConnectionRevoke = 'connection.revoke',

  // Gateway events
  GatewayRequest = 'gateway.request',
  GatewayDenied = 'gateway.denied',
  GatewayProxied = 'gateway.proxied',
}

export enum AuditDecision {
  Allow = 'allow',
  Deny = 'deny',
  StepUp = 'step_up',
  Error = 'error',
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
