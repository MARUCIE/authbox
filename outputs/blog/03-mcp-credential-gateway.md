# The Password Manager That Talks to AI: Building an MCP Credential Gateway

> Your AI agent needs 50 API keys. You have 50 `.env` files. Something has to give.

---

## The Problem Nobody Talks About

Every developer building with AI agents hits the same wall. Your agent needs to call the OpenAI API. Then Stripe. Then AWS. Then GitHub. Before you know it, you are managing 50+ API keys across a dozen projects, scattered in plaintext `.env` files, pasted into chat windows, or hardcoded into config objects you swear you will clean up later.

This is not a minor inconvenience. It is an architectural failure mode:

- **Plaintext secrets in `.env` files** get committed to git, leaked in screenshots, and copied across machines without audit trails.
- **No revocation granularity.** When an agent misbehaves, you revoke the key manually -- which breaks every other agent using the same key.
- **No policy enforcement.** Nothing prevents your coding assistant from making a $500 API call at 3 AM because it decided to "try something."
- **No audit trail.** When something goes wrong, you have no idea which agent accessed which credential, when, or why.

We built [Auth Box](https://github.com/MARUCIE/authbox) to solve this. It is a zero-knowledge password manager -- like 1Password, but with a seed phrase instead of a master account, and a built-in MCP server that gives AI agents controlled, auditable access to credentials.

## What is MCP?

[Model Context Protocol](https://modelcontextprotocol.io/) (MCP) is Anthropic's open standard for connecting AI models to external tools and data sources. Think of it as USB-C for AI integrations: a single protocol that any AI assistant can use to interact with any external system.

An MCP server exposes **tools** -- structured function calls that an AI model can invoke. The model sees a tool's name, description, and input schema, then decides when and how to call it. The key insight is that the model never sees the implementation details. It just knows "I can call `get_credential` to get an API key."

Auth Box implements an MCP server that exposes three tools:

| Tool | Purpose |
|------|---------|
| `get_credential` | Retrieve a credential from the vault, filtered by policy |
| `proxy_authenticated_request` | Make an HTTP request with credentials injected server-side |
| `list_available_services` | Discover what credentials are available |

The critical one is `proxy_authenticated_request`. Instead of handing raw API keys to the agent, Auth Box injects the credential into the HTTP request on the server side. The agent says "call the OpenAI API with this prompt" -- it never sees the key itself.

## Architecture: How the Gateway Works

The MCP gateway lives in the `@authbox/mcp-protocol` package and runs as a WebSocket server. Here is the full flow:

```
AI Agent (Claude, GPT, etc.)
    |
    | WebSocket + delegation key
    v
┌─────────────────────────────────────┐
│  AuthBoxMCPServer (ws://port:19876) │
│                                     │
│  1. Authenticate (verify API key)   │
│  2. Load agent policies             │
│  3. Evaluate PolicyEngine           │
│  4. Execute tool (or deny)          │
│  5. Log audit event (hash-chain)    │
└─────────────────┬───────────────────┘
                  |
                  v
┌─────────────────────────────────────┐
│  VaultBridge (client-side decrypt)  │
│  - getCredential()                  │
│  - proxyRequest()                   │
│  - logAudit()                       │
└─────────────────────────────────────┘
```

The server speaks JSON-RPC 2.0 over WebSocket, implementing the MCP `initialize`, `tools/list`, and `tools/call` methods. Let me walk through each layer.

### 1. Per-Agent Delegation Keys (HD Derivation)

Auth Box uses a BIP-39 seed phrase (24 words) as the sole recovery mechanism. From this seed, all keys are derived deterministically using HD (Hierarchical Deterministic) derivation -- the same proven model Bitcoin wallets use:

```
seed phrase (24 words)
  -> master key (PBKDF2-HMAC-SHA512)
    -> m/auth_box'/vault'/0'    -> vault encryption key
    -> m/auth_box'/sync'/0'     -> sync encryption key
    -> m/auth_box'/agent'/0'    -> agent delegation root
    -> m/auth_box'/agent'/<n>'  -> per-agent sub-key (revocable)
```

Each AI agent gets its own derived key at index `<n>`. Revoking one agent's access does not affect any other agent -- you just invalidate that specific derivation index. No shared secrets, no blast radius.

### 2. The Policy Engine

Every tool call passes through the `PolicyEngine` before execution. Policies are stacked by priority and evaluated in order. All policies must pass for the request to succeed.

Five policy types are supported:

```typescript
// Policy types evaluated on every credential access
enum PolicyType {
  ItemScope       = 'item_scope',    // WHICH credentials the agent can access
  ActionPermission = 'action_perm',  // WHAT it can do (read, use, proxy)
  RateLimit       = 'rate_limit',    // HOW OFTEN (e.g., 100 requests per 300s)
  TimeWindow      = 'time_window',   // WHEN (e.g., weekdays 9AM-6PM only)
  StepUp          = 'step_up',       // REQUIRE human approval for sensitive ops
}
```

A real-world policy configuration might look like this:

```typescript
// Allow the coding assistant to read LLM keys, but not payment credentials.
// Rate limit to 100 requests per 5 minutes. Require approval for proxy requests.
const policies: AgentPolicy[] = [
  {
    id: 'scope-llm-only',
    agentId: 'claude-coding-agent',
    policyType: 'item_scope',
    rules: { allowedItemTypes: ['api_key'] },
    priority: 100,
    enabled: true,
  },
  {
    id: 'action-read-only',
    agentId: 'claude-coding-agent',
    policyType: 'action_perm',
    rules: { allowedActions: ['read', 'proxy'] },
    priority: 90,
    enabled: true,
  },
  {
    id: 'rate-limit-100',
    agentId: 'claude-coding-agent',
    policyType: 'rate_limit',
    rules: { maxRequests: 100, windowSeconds: 300 },
    priority: 80,
    enabled: true,
  },
  {
    id: 'business-hours',
    agentId: 'claude-coding-agent',
    policyType: 'time_window',
    rules: {
      allowedHours: { start: 9, end: 18 },
      allowedDays: [1, 2, 3, 4, 5],  // Mon-Fri
    },
    priority: 70,
    enabled: true,
  },
];
```

### 3. Step-Up Approval

For sensitive operations, the `step_up` policy type pauses execution and sends a notification to the user (via the browser extension or desktop app). The agent's request blocks until the human approves or denies it, with a configurable timeout (default: 60 seconds).

This is the "are you sure?" dialog for AI agents -- except it is enforced at the protocol level, not the UI level. The agent cannot bypass it.

### 4. Audit Trail with Hash-Chain Integrity

Every credential access -- allowed or denied -- generates a structured audit event:

```typescript
interface AuditEvent {
  actorType: 'agent';
  actorId: string;        // which agent
  userId: string;         // which user's vault
  action: string;         // get_credential, proxy_request, list_services
  resourceType: string;   // credential
  resourceId: string;     // service name
  decision: 'allowed' | 'denied' | 'error';
  metadata: {
    reason: string;       // why the decision was made
    policies: string[];   // which policies were evaluated
  };
}
```

Events are chained with hash-chain integrity -- each event includes the hash of the previous event, making retroactive tampering detectable. If someone modifies an old audit record, every subsequent hash breaks.

## The AI Infrastructure Hub

Managing credentials for AI agents is not just about security -- it is also about operational sanity. Auth Box includes a dedicated AI Infrastructure Hub that handles the lifecycle of API keys for 70+ providers:

**Drag-and-drop `.env` import.** Drop a `.env` file into the hub and Auth Box auto-classifies each key by provider (OpenAI, Anthropic, AWS, Stripe, etc.) using pattern matching on key prefixes and known formats.

**One-click health checks.** For supported providers, Auth Box can verify that a key is still valid by making a minimal API call (e.g., listing models for OpenAI, describing regions for AWS). No more deploying to production only to discover your key expired last Tuesday.

**Categorized view.** Keys are organized by category -- LLM, Cloud, Payment, Analytics, Communication -- so you can see your entire AI infrastructure at a glance instead of grepping through 30 `.env` files.

## Code Example: Connecting an Agent

Here is how an AI agent connects to Auth Box and retrieves a credential:

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:19876?api_key=YOUR_DELEGATION_KEY');

ws.on('open', () => {
  // 1. Initialize the MCP session
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'my-agent', version: '1.0.0' },
    },
  }));

  // 2. List available tools
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  }));

  // 3. Retrieve a credential (policy-gated)
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'get_credential',
      arguments: { service_name: 'OpenAI', fields: ['api_key'] },
    },
  }));

  // 4. Or better: proxy a request (agent never sees the key)
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'proxy_authenticated_request',
      arguments: {
        service_name: 'OpenAI',
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      },
    },
  }));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('Response:', JSON.stringify(response, null, 2));
});
```

The `proxy_authenticated_request` tool is the preferred pattern. The agent describes what it wants to do ("POST to the OpenAI completions endpoint with this payload"), and Auth Box handles authentication. The API key never appears in the agent's context window, which eliminates an entire class of prompt injection attacks where a malicious prompt tricks the agent into leaking its credentials.

## Why This Matters

The current state of agent credential management is where web authentication was in 2005 -- passwords in plaintext databases, no OAuth, no token rotation, no audit trails. We are building increasingly autonomous systems and handing them the keys to our infrastructure with zero access control.

Auth Box takes a different position: **agent credentials, not agent chaos.**

- **Zero-knowledge.** The server stores only encrypted blobs. It cannot decrypt your vault, your credentials, or your agent keys.
- **Survivable.** Auth Box uses a 24-word seed phrase. If we disappear tomorrow, your credentials still work. No vendor lock-in.
- **Granular delegation.** Each agent gets its own derived key with its own policy set. Revoke one without touching the others.
- **Auditable.** Every access decision is logged with hash-chain integrity. When your agent does something unexpected at 3 AM, you can trace exactly what happened.
- **MCP-native.** Any AI assistant that speaks MCP can connect. Claude, GPT, Gemini, or your custom agent -- one protocol, one gateway.

## Try It Yourself

Auth Box is open source (MIT).

```bash
git clone https://github.com/MARUCIE/authbox.git
cd authbox
pnpm install
make dev-full    # Starts Postgres + Redis + API + Web
```

- Web app: `http://localhost:3010`
- MCP server: `ws://localhost:19876`
- API: `http://localhost:4010`

The MCP gateway package is at `packages/mcp-protocol/`. The policy engine, tool definitions, and WebSocket server are each under 300 lines. Read the source -- there is no magic, just careful engineering.

GitHub: [github.com/MARUCIE/authbox](https://github.com/MARUCIE/authbox)

---

Maurice | maurice_wen@proton.me
