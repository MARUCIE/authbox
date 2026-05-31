import { WebSocketServer, WebSocket } from 'ws';
import type { AgentPolicy } from '@authbox/shared';
import { PolicyEngine, type AccessRequest, type AccessDecision, type PendingApproval } from './policy-engine';
import { authboxTools, type ProxyRequest, type ProxyResponse, type ToolCallResult } from './tools';

export interface AuditEvent {
  actorType: 'agent';
  actorId: string;
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  decision: 'allowed' | 'denied' | 'error';
  metadata?: Record<string, unknown>;
}

export interface VaultBridge {
  getCredential(userId: string, serviceName: string): Promise<Record<string, string> | null>;
  listServices(userId: string): Promise<string[]>;
  proxyRequest(userId: string, serviceName: string, request: ProxyRequest): Promise<ProxyResponse>;
  getPolicies(agentId: string): Promise<AgentPolicy[]>;
  verifyApiKey(apiKey: string): Promise<{ agentId: string; userId: string } | null>;
  logAudit(event: AuditEvent): Promise<void>;
  /** Notify the user about a pending step-up approval (e.g., show browser notification). */
  notifyApproval?(approval: PendingApproval): void;
}

interface MCPSession {
  agentId: string;
  userId: string;
  ws: WebSocket;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const MCP_VERSION = '2024-11-05';
const SERVER_NAME = 'authbox-vault';
const SERVER_VERSION = '2.0.0';

export class AuthBoxMCPServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<WebSocket, MCPSession>();
  private policyEngine = new PolicyEngine();

  constructor(
    private bridge: VaultBridge,
    private options: { port?: number } = {},
  ) {
    // Wire step-up approval notifications to the bridge
    this.policyEngine.onApprovalNeeded = (approval) => {
      this.bridge.notifyApproval?.(approval);
    };
  }

  /** Resolve a pending step-up approval (called from the extension UI). */
  resolveApproval(approvalId: string, approved: boolean): boolean {
    return this.policyEngine.resolveApproval(approvalId, approved);
  }

  /** Get pending approvals (for the extension popup to display). */
  getPendingApprovals(): PendingApproval[] {
    return this.policyEngine.getPendingApprovals();
  }

  start(): void {
    const port = this.options.port ?? 19876;

    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const apiKey = url.searchParams.get('api_key') ?? req.headers['x-api-key'] as string;

      if (!apiKey) {
        ws.close(4001, 'API key required');
        return;
      }

      this.authenticate(ws, apiKey);
    });

    // Reset rate limit counters every 5 minutes
    const interval = setInterval(() => this.policyEngine.resetCounters(), 5 * 60 * 1000);
    this.wss.on('close', () => clearInterval(interval));
  }

  stop(): void {
    if (this.wss) {
      for (const ws of this.sessions.keys()) {
        ws.close(1000, 'Server shutting down');
      }
      this.sessions.clear();
      this.wss.close();
      this.wss = null;
    }
  }

  private async authenticate(ws: WebSocket, apiKey: string): Promise<void> {
    try {
      const identity = await this.bridge.verifyApiKey(apiKey);
      if (!identity) {
        ws.close(4003, 'Invalid API key');
        return;
      }

      const session: MCPSession = {
        agentId: identity.agentId,
        userId: identity.userId,
        ws,
      };

      this.sessions.set(ws, session);

      ws.on('message', (data) => {
        this.handleMessage(session, data.toString());
      });

      ws.on('close', () => {
        this.sessions.delete(ws);
      });

      ws.on('error', () => {
        this.sessions.delete(ws);
      });
    } catch {
      ws.close(4500, 'Authentication error');
    }
  }

  private async handleMessage(session: MCPSession, raw: string): Promise<void> {
    let parsed: JsonRpcRequest;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.send(session.ws, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
      return;
    }

    const { id, method, params } = parsed;

    try {
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = this.handleInitialize();
          break;
        case 'tools/list':
          result = this.handleToolsList();
          break;
        case 'tools/call':
          result = await this.handleToolCall(session, params ?? {});
          break;
        case 'ping':
          result = {};
          break;
        default:
          this.send(session.ws, {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          });
          return;
      }

      this.send(session.ws, { jsonrpc: '2.0', id, result });
    } catch (err) {
      this.send(session.ws, {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : 'Internal error',
        },
      });
    }
  }

  private handleInitialize(): unknown {
    return {
      protocolVersion: MCP_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    };
  }

  private handleToolsList(): unknown {
    return {
      tools: authboxTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  private async handleToolCall(
    session: MCPSession,
    params: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const toolName = params.name as string;
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    const policies = await this.bridge.getPolicies(session.agentId);

    switch (toolName) {
      case 'get_credential':
        return this.toolGetCredential(session, policies, args);
      case 'proxy_authenticated_request':
        return this.toolProxyRequest(session, policies, args);
      case 'list_available_services':
        return this.toolListServices(session, policies);
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  }

  private async toolGetCredential(
    session: MCPSession,
    policies: AgentPolicy[],
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const serviceName = args.service_name as string;
    const fields = args.fields as string[] | undefined;

    const request: AccessRequest = {
      agentId: session.agentId,
      action: 'read',
      itemId: serviceName,
    };

    const decision = this.policyEngine.evaluate(policies, request);

    // Handle step-up approval: wait for user decision
    if (!decision.allowed && decision.pendingApprovalId) {
      const approved = await this.policyEngine.requestApproval(
        decision.pendingApprovalId,
        request,
      );
      if (!approved) {
        decision.reason = 'Step-up approval denied by user';
        await this.logAccess(session, 'get_credential', serviceName, decision);
        return {
          content: [{ type: 'text', text: 'Access denied: step-up approval was denied by the user' }],
          isError: true,
        };
      }
      // User approved -- continue with credential retrieval
      decision.allowed = true;
      decision.reason = 'Step-up approval granted by user';
    }

    await this.logAccess(session, 'get_credential', serviceName, decision);

    if (!decision.allowed) {
      return {
        content: [{ type: 'text', text: `Access denied: ${decision.reason}` }],
        isError: true,
      };
    }

    const credential = await this.bridge.getCredential(session.userId, serviceName);
    if (!credential) {
      return {
        content: [{ type: 'text', text: `No credential found for service: ${serviceName}` }],
        isError: true,
      };
    }

    // Filter fields if requested
    const filtered = fields
      ? Object.fromEntries(Object.entries(credential).filter(([k]) => fields.includes(k)))
      : credential;

    return {
      content: [{ type: 'text', text: JSON.stringify(filtered) }],
    };
  }

  private async toolProxyRequest(
    session: MCPSession,
    policies: AgentPolicy[],
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const serviceName = args.service_name as string;

    const request: AccessRequest = {
      agentId: session.agentId,
      action: 'proxy',
      itemId: serviceName,
    };

    const decision = this.policyEngine.evaluate(policies, request);

    // Handle step-up approval for proxy requests
    if (!decision.allowed && decision.pendingApprovalId) {
      const approved = await this.policyEngine.requestApproval(
        decision.pendingApprovalId,
        request,
      );
      if (!approved) {
        decision.reason = 'Step-up approval denied by user';
        await this.logAccess(session, 'proxy_request', serviceName, decision);
        return {
          content: [{ type: 'text', text: 'Access denied: step-up approval was denied by the user' }],
          isError: true,
        };
      }
      decision.allowed = true;
      decision.reason = 'Step-up approval granted by user';
    }

    await this.logAccess(session, 'proxy_request', serviceName, decision);

    if (!decision.allowed) {
      return {
        content: [{ type: 'text', text: `Access denied: ${decision.reason}` }],
        isError: true,
      };
    }

    const proxyReq: ProxyRequest = {
      method: args.method as string,
      url: args.url as string,
      headers: args.headers as Record<string, string> | undefined,
      body: args.body as string | undefined,
    };

    try {
      const response = await this.bridge.proxyRequest(session.userId, serviceName, proxyReq);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: response.status,
            headers: response.headers,
            body: response.body,
          }),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Proxy request failed: ${err instanceof Error ? err.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  }

  private async toolListServices(
    session: MCPSession,
    policies: AgentPolicy[],
  ): Promise<ToolCallResult> {
    const request: AccessRequest = {
      agentId: session.agentId,
      action: 'read',
    };

    const decision = this.policyEngine.evaluate(policies, request);
    await this.logAccess(session, 'list_services', undefined, decision);

    if (!decision.allowed) {
      return {
        content: [{ type: 'text', text: `Access denied: ${decision.reason}` }],
        isError: true,
      };
    }

    const services = await this.bridge.listServices(session.userId);

    return {
      content: [{ type: 'text', text: JSON.stringify({ services }) }],
    };
  }

  private async logAccess(
    session: MCPSession,
    action: string,
    resourceId: string | undefined,
    decision: AccessDecision,
  ): Promise<void> {
    try {
      await this.bridge.logAudit({
        actorType: 'agent',
        actorId: session.agentId,
        userId: session.userId,
        action,
        resourceType: 'credential',
        resourceId,
        decision: decision.allowed ? 'allowed' : 'denied',
        metadata: {
          reason: decision.reason,
          policies: decision.appliedPolicies,
        },
      });
    } catch {
      // Audit logging should not break the request flow
    }
  }

  private send(ws: WebSocket, message: JsonRpcResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}
