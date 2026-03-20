import type { AgentPolicy, PolicyRules } from '@authbox/shared';

export interface AccessRequest {
  agentId: string;
  action: 'read' | 'use' | 'proxy';
  itemType?: string;
  itemId?: string;
  folderId?: string;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  appliedPolicies: string[];
  /** When step-up is required, this contains a request ID to track the approval. */
  pendingApprovalId?: string;
}

export interface PendingApproval {
  id: string;
  agentId: string;
  action: string;
  itemType?: string;
  itemId?: string;
  reason: string;
  createdAt: number;
  resolve: (approved: boolean) => void;
}

export class PolicyEngine {
  private rateLimitCounters = new Map<string, { count: number; windowStart: number }>();
  private pendingApprovals = new Map<string, PendingApproval>();

  /** Callback invoked when step-up approval is needed. Set by the MCP server. */
  onApprovalNeeded?: (approval: PendingApproval) => void;

  evaluate(policies: AgentPolicy[], request: AccessRequest): AccessDecision {
    if (policies.length === 0) {
      return { allowed: false, reason: 'No policies defined', appliedPolicies: [] };
    }

    const enabled = policies
      .filter((p) => p.enabled)
      .sort((a, b) => b.priority - a.priority);

    if (enabled.length === 0) {
      return { allowed: false, reason: 'All policies disabled', appliedPolicies: [] };
    }

    const applied: string[] = [];

    for (const policy of enabled) {
      const result = this.evaluatePolicy(policy, request);
      applied.push(policy.id);

      if (!result.allowed) {
        return { allowed: false, reason: result.reason, appliedPolicies: applied };
      }
    }

    return { allowed: true, reason: 'All policies passed', appliedPolicies: applied };
  }

  private evaluatePolicy(
    policy: AgentPolicy,
    request: AccessRequest,
  ): { allowed: boolean; reason: string } {
    const rules = policy.rules;

    switch (policy.policyType) {
      case 'item_scope':
        return this.checkItemScope(rules, request);
      case 'action_perm':
        return this.checkActionPermission(rules, request);
      case 'rate_limit':
        return this.checkRateLimit(request.agentId, rules);
      case 'time_window':
        return this.checkTimeWindow(rules);
      case 'step_up':
        return this.checkStepUp(rules, request);
      default:
        return { allowed: true, reason: 'Unknown policy type, defaulting to allow' };
    }
  }

  private checkItemScope(
    rules: PolicyRules,
    request: AccessRequest,
  ): { allowed: boolean; reason: string } {
    if (rules.deniedItemIds?.includes(request.itemId ?? '')) {
      return { allowed: false, reason: 'Item explicitly denied' };
    }

    if (rules.allowedItemTypes && request.itemType) {
      const allowed = rules.allowedItemTypes as string[];
      if (!allowed.includes(request.itemType)) {
        return { allowed: false, reason: `Item type '${request.itemType}' not in allowed types` };
      }
    }

    if (rules.allowedItemIds && request.itemId) {
      if (!rules.allowedItemIds.includes(request.itemId)) {
        return { allowed: false, reason: 'Item ID not in allowed list' };
      }
    }

    if (rules.allowedFolderIds && request.folderId) {
      if (!rules.allowedFolderIds.includes(request.folderId)) {
        return { allowed: false, reason: 'Folder not in allowed list' };
      }
    }

    return { allowed: true, reason: 'Item scope check passed' };
  }

  private checkActionPermission(
    rules: PolicyRules,
    request: AccessRequest,
  ): { allowed: boolean; reason: string } {
    if (!rules.allowedActions || rules.allowedActions.length === 0) {
      return { allowed: true, reason: 'No action restrictions' };
    }

    if (!rules.allowedActions.includes(request.action)) {
      return { allowed: false, reason: `Action '${request.action}' not permitted` };
    }

    return { allowed: true, reason: 'Action permitted' };
  }

  private checkRateLimit(
    agentId: string,
    rules: PolicyRules,
  ): { allowed: boolean; reason: string } {
    if (!rules.maxRequests || !rules.windowSeconds) {
      return { allowed: true, reason: 'No rate limit configured' };
    }

    const now = Date.now();
    const windowMs = rules.windowSeconds * 1000;
    const key = agentId;
    const counter = this.rateLimitCounters.get(key);

    if (!counter || now - counter.windowStart > windowMs) {
      this.rateLimitCounters.set(key, { count: 1, windowStart: now });
      return { allowed: true, reason: 'Rate limit check passed' };
    }

    if (counter.count >= rules.maxRequests) {
      return { allowed: false, reason: `Rate limit exceeded: ${rules.maxRequests} requests per ${rules.windowSeconds}s` };
    }

    counter.count++;
    return { allowed: true, reason: 'Rate limit check passed' };
  }

  private checkTimeWindow(rules: PolicyRules): { allowed: boolean; reason: string } {
    if (!rules.allowedHours) {
      return { allowed: true, reason: 'No time window restriction' };
    }

    const now = new Date();
    const hour = now.getHours();
    const { start, end } = rules.allowedHours;

    const inWindow = start <= end
      ? hour >= start && hour < end
      : hour >= start || hour < end; // wraps midnight

    if (!inWindow) {
      return { allowed: false, reason: `Current hour ${hour} outside allowed window ${start}-${end}` };
    }

    if (rules.allowedDays) {
      const day = now.getDay();
      if (!rules.allowedDays.includes(day)) {
        return { allowed: false, reason: `Day ${day} not in allowed days` };
      }
    }

    return { allowed: true, reason: 'Time window check passed' };
  }

  private checkStepUp(
    rules: PolicyRules,
    request: AccessRequest,
  ): { allowed: boolean; reason: string; pendingApprovalId?: string } {
    if (!rules.requireApproval) {
      return { allowed: true, reason: 'No step-up required' };
    }

    // Create a pending approval entry so the caller can wait for user decision.
    const approvalId = `stepup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return {
      allowed: false,
      reason: 'Step-up approval required',
      pendingApprovalId: approvalId,
    };
  }

  /**
   * Request step-up approval asynchronously. Returns a promise that resolves
   * when the user approves or rejects the request. Times out after the
   * specified duration (default: 60s).
   */
  requestApproval(
    approvalId: string,
    request: AccessRequest,
    timeoutMs = 60_000,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const pending: PendingApproval = {
        id: approvalId,
        agentId: request.agentId,
        action: request.action,
        itemType: request.itemType,
        itemId: request.itemId,
        reason: 'Step-up approval required for this action',
        createdAt: Date.now(),
        resolve: (approved: boolean) => {
          this.pendingApprovals.delete(approvalId);
          resolve(approved);
        },
      };

      this.pendingApprovals.set(approvalId, pending);

      // Notify the bridge (extension popup) about the approval request
      this.onApprovalNeeded?.(pending);

      // Auto-reject on timeout
      setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  /**
   * Resolve a pending approval (called when user clicks approve/deny in the extension).
   */
  resolveApproval(approvalId: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return false;

    pending.resolve(approved);
    return true;
  }

  /** Get all pending approvals (for UI display). */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  resetCounters(): void {
    this.rateLimitCounters.clear();
  }
}
