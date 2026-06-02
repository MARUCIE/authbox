import type { ItemType } from './vault';

export enum AgentType {
  MCPClient = 'mcp_client',
  Claude = 'claude',
  ChatGPT = 'chatgpt',
  Gemini = 'gemini',
  Custom = 'custom',
}

export enum AgentStatus {
  Active = 'active',
  Suspended = 'suspended',
  Revoked = 'revoked',
}

export interface Agent {
  id: string;
  userId: string;
  name: string;
  agentType: AgentType;
  apiKeyHash: string;
  description?: string;
  status: AgentStatus;
  lastAccessAt?: string;
  createdAt: string;
  updatedAt: string;
}

export enum PolicyType {
  ItemScope = 'item_scope',
  ActionPermission = 'action_perm',
  RateLimit = 'rate_limit',
  TimeWindow = 'time_window',
  StepUp = 'step_up',
}

export interface PolicyRules {
  allowedItemTypes?: ItemType[];
  allowedItemIds?: string[];
  allowedFolderIds?: string[];
  deniedItemIds?: string[];

  allowedActions?: ('read' | 'use' | 'proxy')[];

  maxRequests?: number;
  windowSeconds?: number;

  allowedHours?: { start: number; end: number };
  allowedDays?: number[];

  requireApproval?: boolean;
  approvalTimeoutSeconds?: number;
}

export interface AgentPolicy {
  id: string;
  agentId: string;
  policyType: PolicyType;
  rules: PolicyRules;
  scopeFilter?: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
