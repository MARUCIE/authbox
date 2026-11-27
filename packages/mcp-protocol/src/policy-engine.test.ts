import { describe, expect, it, vi } from 'vitest';
import type { AgentPolicy } from '@authbox/shared';
import { PolicyEngine } from './policy-engine.js';

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

describe('PolicyEngine rate_limit', () => {
  const hourly = policy({
    id: 'hourly',
    policyType: 'rate_limit',
    rules: { maxRequests: 2, windowSeconds: 3600 },
  });
  const request = { agentId: 'agent-1', action: 'read' as const, itemType: 'login', itemId: 'x' };

  it('keeps a long window when counters are swept', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const engine = new PolicyEngine();
      expect(engine.evaluate([hourly], request).allowed).toBe(true);
      expect(engine.evaluate([hourly], request).allowed).toBe(true);
      expect(engine.evaluate([hourly], request).allowed).toBe(false);

      // The server sweeps every 5 minutes; that must not refill an hourly budget.
      vi.setSystemTime(10 * 60 * 1000);
      engine.pruneExpiredCounters();
      expect(engine.evaluate([hourly], request).allowed).toBe(false);

      vi.setSystemTime(3600 * 1000);
      engine.pruneExpiredCounters();
      expect(engine.evaluate([hourly], request).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives each rate_limit policy its own counter', () => {
    const engine = new PolicyEngine();
    const burst = policy({
      id: 'burst',
      policyType: 'rate_limit',
      priority: 2,
      rules: { maxRequests: 3, windowSeconds: 1 },
    });
    // Both policies are checked on each call; with a shared counter the
    // hourly limit of 2 would only be seen against the burst policy's count.
    expect(engine.evaluate([burst, hourly], request).allowed).toBe(true);
    expect(engine.evaluate([burst, hourly], request).allowed).toBe(true);
    const third = engine.evaluate([burst, hourly], request);
    expect(third.allowed).toBe(false);
    expect(third.reason).toContain('per 3600s');
  });
});
