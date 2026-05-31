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
