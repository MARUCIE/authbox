'use client';

import { useEffect, useState, useCallback } from 'react';
import { useVaultStore } from '@/lib/vault-store';
import { agentApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/vault/dialog';

interface AgentItem {
  id: string;
  name: string;
  description: string;
  agentType: string;
  status: string;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PolicyItem {
  id: string;
  policyType: string;
  rules: Record<string, unknown>;
  scopeFilter: Record<string, unknown> | null;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'list' | 'detail' | 'create';

const AGENT_TYPES = [
  { value: 'mcp_client', label: 'MCP Client' },
  { value: 'claude', label: 'Claude' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'var(--tertiary-container)', text: 'var(--tertiary)', dot: 'var(--tertiary)' },
  suspended: { bg: 'rgba(255, 183, 125, 0.15)', text: 'var(--secondary)', dot: 'var(--secondary)' },
  revoked: { bg: 'rgba(255, 180, 171, 0.15)', text: 'var(--destructive)', dot: 'var(--destructive)' },
};

export default function AgentsPage() {
  const sessionToken = useVaultStore((s) => s.sessionToken);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('mcp_client');

  // API key reveal (shown once after creation)
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);

  // Policies for selected agent
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyType, setPolicyType] = useState('scope_access');
  const [policyRules, setPolicyRules] = useState('{\n  "allowed_types": ["login"],\n  "actions": ["read"]\n}');
  const [creatingPolicy, setCreatingPolicy] = useState(false);

  const fetchAgents = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await agentApi.list(sessionToken);
      setAgents(res.agents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const fetchPolicies = useCallback(async (agentId: string) => {
    if (!sessionToken) return;
    try {
      const res = await agentApi.listPolicies(sessionToken, agentId);
      setPolicies(res.policies ?? []);
    } catch {
      setPolicies([]);
    }
  }, [sessionToken]);

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  async function handleCreate() {
    if (!sessionToken || !newName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await agentApi.create(sessionToken, {
        name: newName.trim(),
        description: newDescription.trim(),
        agentType: newType,
      });
      setRevealedApiKey(res.apiKey);
      setNewName('');
      setNewDescription('');
      setNewType('mcp_client');
      await fetchAgents();
      setSelectedId(res.id);
      setViewMode('detail');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(agent: AgentItem) {
    if (!sessionToken) return;
    const newStatus = agent.status === 'active' ? 'suspended' : 'active';
    try {
      await agentApi.update(sessionToken, agent.id, { status: newStatus });
      await fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    }
  }

  async function handleDelete(agentId: string) {
    if (!sessionToken) return;
    try {
      await agentApi.delete(sessionToken, agentId);
      setSelectedId(null);
      setViewMode('list');
      await fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    }
  }

  async function handleDeletePolicy(policyId: string) {
    if (!sessionToken || !selectedId) return;
    try {
      await agentApi.deletePolicy(sessionToken, selectedId, policyId);
      await fetchPolicies(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete policy');
    }
  }

  async function handleCreatePolicy() {
    if (!sessionToken || !selectedId) return;
    setCreatingPolicy(true);
    setError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(policyRules);
      } catch {
        setError('Invalid JSON syntax in policy rules');
        return;
      }
      // Schema validation: rules must be an object with expected fields
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setError('Policy rules must be a JSON object');
        return;
      }
      const rules = parsed as Record<string, unknown>;
      if (rules.allowed_types && !Array.isArray(rules.allowed_types)) {
        setError('allowed_types must be an array');
        return;
      }
      if (rules.actions && !Array.isArray(rules.actions)) {
        setError('actions must be an array');
        return;
      }
      await agentApi.createPolicy(sessionToken, selectedId, {
        policyType,
        rules,
      });
      setShowPolicyForm(false);
      setPolicyType('scope_access');
      setPolicyRules('{\n  "allowed_types": ["login"],\n  "actions": ["read"]\n}');
      await fetchPolicies(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create policy');
    } finally {
      setCreatingPolicy(false);
    }
  }

  useEffect(() => {
    if (selectedId && viewMode === 'detail') {
      fetchPolicies(selectedId);
    }
  }, [selectedId, viewMode, fetchPolicies]);

  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)]">
      {/* Left: Agent list */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>AI Agents</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {agents.length} agent{agents.length !== 1 ? 's' : ''} registered
            </p>
          </div>
          <button
            onClick={() => { setViewMode('create'); setRevealedApiKey(null); }}
            className="btn-gradient px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Register Agent
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {agents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center flex-1 flex flex-col items-center justify-center">
            <h3 className="text-lg font-medium mb-2">No agents registered</h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              Register an AI agent to give it controlled access to your vault credentials via MCP.
            </p>
            <Button onClick={() => setViewMode('create')}>Register Agent</Button>
          </div>
        ) : (
          <div className="space-y-1 overflow-y-auto flex-1">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => { setSelectedId(agent.id); setViewMode('detail'); setRevealedApiKey(null); }}
                className="w-full flex items-center gap-3 rounded-lg p-3 text-left transition-all"
                style={{
                  background: agent.id === selectedId ? 'var(--surface-highest)' : 'transparent',
                  border: agent.id === selectedId ? '1px solid var(--ghost-border)' : '1px solid transparent',
                }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium shrink-0"
                  style={{ background: 'var(--primary-container)', color: 'var(--primary)' }}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{agent.name}</p>
                    {(() => {
                      const cfg = STATUS_CONFIG[agent.status];
                      return cfg ? (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md" style={{ background: cfg.bg, color: cfg.text }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot }} />
                          {agent.status}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] truncate">
                    {agent.agentType} -- {agent.lastActiveAt ? `Active ${new Date(agent.lastActiveAt).toLocaleDateString()}` : 'Never active'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Detail panel */}
      {selectedAgent && viewMode === 'detail' && (
        <aside className="w-96 shrink-0 pl-6 flex flex-col" style={{ borderLeft: '1px solid var(--ghost-border)' }}>
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
            <div>
              <h3 className="font-semibold">{selectedAgent.name}</h3>
              <p className="text-xs text-[var(--muted-foreground)]">{selectedAgent.agentType}</p>
            </div>
            <button
              onClick={() => { setSelectedId(null); setViewMode('list'); }}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-lg"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {/* API Key reveal (shown once after creation) */}
          {revealedApiKey && (
            <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(255, 183, 125, 0.15)', border: '1px solid var(--secondary-container)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--secondary)' }}>
                API Key (shown once -- copy now!)
              </p>
              <code className="text-xs font-mono break-all select-all" style={{ color: 'var(--secondary)' }}>
                {revealedApiKey}
              </code>
            </div>
          )}

          {/* Agent details */}
          <div className="flex-1 py-4 space-y-4 overflow-y-auto">
            {selectedAgent.description && (
              <div>
                <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Description</label>
                <p className="text-sm mt-1">{selectedAgent.description}</p>
              </div>
            )}

            <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
              <span>Status</span>
              {(() => {
                const cfg = STATUS_CONFIG[selectedAgent.status];
                return cfg ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs" style={{ background: cfg.bg, color: cfg.text }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot }} />
                    {selectedAgent.status}
                  </span>
                ) : <span>{selectedAgent.status}</span>;
              })()}
            </div>
            <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
              <span>Created</span>
              <span>{new Date(selectedAgent.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
              <span>Last Active</span>
              <span>{selectedAgent.lastActiveAt ? new Date(selectedAgent.lastActiveAt).toLocaleDateString() : 'Never'}</span>
            </div>

            {/* Policies section */}
            <div className="pt-4 border-t border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Access Policies</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">{policies.length} polic{policies.length !== 1 ? 'ies' : 'y'}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPolicyForm(!showPolicyForm)}
                  >
                    {showPolicyForm ? 'Cancel' : 'Add Policy'}
                  </Button>
                </div>
              </div>

              {showPolicyForm && (
                <div className="rounded-lg border border-[var(--border)] p-3 mb-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Policy Type</label>
                    <select
                      value={policyType}
                      onChange={(e) => setPolicyType(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-1 text-sm"
                    >
                      <option value="scope_access">Scope Access</option>
                      <option value="rate_limit">Rate Limit</option>
                      <option value="time_window">Time Window</option>
                      <option value="step_up_auth">Step-Up Auth</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Rules (JSON)</label>
                    <textarea
                      value={policyRules}
                      onChange={(e) => setPolicyRules(e.target.value)}
                      rows={4}
                      className="flex w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreatePolicy}
                    disabled={creatingPolicy}
                  >
                    {creatingPolicy ? 'Creating...' : 'Create Policy'}
                  </Button>
                </div>
              )}

              {policies.length === 0 && !showPolicyForm ? (
                <p className="text-xs text-[var(--muted-foreground)]">No policies defined. This agent has no vault access.</p>
              ) : (
                <div className="space-y-2">
                  {policies.map((policy) => (
                    <div key={policy.id} className="rounded-lg border border-[var(--border)] p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{policy.policyType}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${policy.enabled ? 'text-green-600' : 'text-[var(--muted-foreground)]'}`}>
                            {policy.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                          <button
                            onClick={() => handleDeletePolicy(policy.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <pre className="text-xs text-[var(--muted-foreground)] overflow-x-auto">
                        {JSON.stringify(policy.rules, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MCP config snippet */}
            <div className="pt-4" style={{ borderTop: '1px solid var(--ghost-border)' }}>
              <h4 className="text-sm font-medium mb-2" style={{ fontFamily: 'var(--font-heading)' }}>MCP Configuration</h4>
              <pre className="text-xs rounded-lg p-3 overflow-x-auto hash-block">
{`{
  "mcpServers": {
    "authbox-vault": {
      "transport": "websocket",
      "url": "ws://localhost:19876/mcp"
    }
  }
}`}
              </pre>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
            <Button
              onClick={() => handleToggleStatus(selectedAgent)}
              variant="outline"
              className="flex-1"
            >
              {selectedAgent.status === 'active' ? 'Suspend' : 'Activate'}
            </Button>
            <Button
              onClick={() => handleDelete(selectedAgent.id)}
              variant="ghost"
              className="flex-1 text-[var(--destructive)]"
            >
              Revoke
            </Button>
          </div>
        </aside>
      )}

      {/* Create dialog */}
      <Dialog
        open={viewMode === 'create'}
        onClose={() => setViewMode('list')}
        title="Register AI Agent"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-name" className="text-sm font-medium">Agent Name</label>
            <Input
              id="agent-name"
              placeholder="e.g. My Claude Desktop"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-type" className="text-sm font-medium">Agent Type</label>
            <select
              id="agent-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            >
              {AGENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-desc" className="text-sm font-medium">Description</label>
            <textarea
              id="agent-desc"
              placeholder="Optional description..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              className="flex w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setViewMode('list')}>Cancel</Button>
            <Button onClick={handleCreate} disabled={loading || !newName.trim()}>
              {loading ? 'Registering...' : 'Register'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
