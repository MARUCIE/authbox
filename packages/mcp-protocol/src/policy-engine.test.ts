import { describe, expect, it } from 'vitest';
import type { AgentPolicy } from '@authbox/shared';
import { PolicyEngine } from './policy-engine';

function policy(overrides: Partial<AgentPolicy>): AgentPolicy {
  return {
    id: 'policy-1',
    agentId: 'agent-1',
    policyType: 'action_perm',
    rules: {},
    priority: 1,
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  } as AgentPolicy;
}

describe('PolicyEngine', () => {
  it('denies unknown policy types instead of failing open', () => {
    const engine = new PolicyEngine();
    const decision = engine.evaluate(
      [
        policy({
          policyType: 'scope_access' as AgentPolicy['policyType'],
          rules: { allowedActions: ['read'] },
        }),
      ],
      { agentId: 'agent-1', action: 'read', itemType: 'login', itemId: 'GitHub' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Unknown policy type');
  });

  it('surfaces a pending approval id for step_up policies when other policies pass', () => {
    const engine = new PolicyEngine();
    const decision = engine.evaluate(
      [
        policy({
          id: 'stepup-1',
          policyType: 'step_up',
          rules: { requireApproval: true, approvalTimeoutSeconds: 120 },
        }),
        policy({ id: 'action-1', policyType: 'action_perm', rules: { allowedActions: ['read'] } }),
      ],
      { agentId: 'agent-1', action: 'read', itemId: 'GitHub' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.pendingApprovalId).toBeTruthy();
    expect(decision.approvalTimeoutMs).toBe(120_000);
  });

  it('does not surface step-up approval when another policy denies', () => {
    const engine = new PolicyEngine();
    const decision = engine.evaluate(
      [
        policy({
          id: 'stepup-1',
          policyType: 'step_up',
          rules: { requireApproval: true },
        }),
        policy({ id: 'action-1', policyType: 'action_perm', rules: { allowedActions: ['proxy'] } }),
      ],
      { agentId: 'agent-1', action: 'read', itemId: 'GitHub' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.pendingApprovalId).toBeUndefined();
    expect(decision.reason).toContain('not permitted');
  });

  it('tracks independent windows for multiple rate_limit policies on one agent', () => {
    const engine = new PolicyEngine();
    const perMinute = policy({
      id: 'rl-minute',
      policyType: 'rate_limit',
      rules: { maxRequests: 2, windowSeconds: 60 },
    });
    const perHour = policy({
      id: 'rl-hour',
      policyType: 'rate_limit',
      rules: { maxRequests: 100, windowSeconds: 3600 },
      priority: 0,
    });
    const request = { agentId: 'agent-1', action: 'read' as const, itemId: 'GitHub' };

    expect(engine.evaluate([perMinute, perHour], request).allowed).toBe(true);
    expect(engine.evaluate([perMinute, perHour], request).allowed).toBe(true);
    // Third request breaches the per-minute limit even though per-hour has room.
    const third = engine.evaluate([perMinute, perHour], request);
    expect(third.allowed).toBe(false);
    expect(third.reason).toContain('Rate limit exceeded');
  });

  it('keeps live rate-limit windows across pruneExpiredCounters', () => {
    const engine = new PolicyEngine();
    const limit = policy({
      id: 'rl-1',
      policyType: 'rate_limit',
      rules: { maxRequests: 2, windowSeconds: 3600 },
    });
    const request = { agentId: 'agent-1', action: 'read' as const, itemId: 'GitHub' };

    expect(engine.evaluate([limit], request).allowed).toBe(true);
    expect(engine.evaluate([limit], request).allowed).toBe(true);
    engine.pruneExpiredCounters();
    // The hour-long window is still live, so the quota must not reset.
    expect(engine.evaluate([limit], request).allowed).toBe(false);
  });

  it('denies scoped item policies when required request attributes are missing', () => {
    const engine = new PolicyEngine();
    const decision = engine.evaluate(
      [
        policy({
          policyType: 'item_scope',
          rules: { allowedItemTypes: ['login'], allowedItemIds: ['GitHub'] },
        }),
      ],
      { agentId: 'agent-1', action: 'read' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Missing item type');
  });
});
