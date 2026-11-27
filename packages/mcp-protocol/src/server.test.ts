import { afterEach, describe, expect, it } from "vitest";
import { createConnection } from "node:net";
import WebSocket from "ws";
import { AuthBoxMCPServer, type VaultBridge } from "./server.js";

const PORT = 19911;

function bridge(services: string[] = []): VaultBridge {
  return {
    verifyApiKey: async (k) => (k === "good" ? { agentId: "a", userId: "u" } : null),
    getPolicies: async () => [
      {
        id: "p1",
        agentId: "a",
        policyType: "item_scope",
        rules: { deniedItemIds: ["Bank"] },
        priority: 0,
        enabled: true,
      } as never,
    ],
    logAudit: async () => {},
    listServices: async () => services,
    getCredential: async () => null,
    proxyRequest: async () => ({ status: 200, headers: {}, body: "" }) as never,
  };
}

function open(headers: Record<string, string> = { "x-api-key": "good" }): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { headers });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => ws.once("message", (d) => resolve(JSON.parse(d.toString()))));
}

let server: AuthBoxMCPServer | null = null;
afterEach(() => {
  server?.stop();
  server = null;
});

describe("AuthBoxMCPServer resilience", () => {
  it("survives a malformed frame from an unauthenticated client", async () => {
    server = new AuthBoxMCPServer(bridge(), { port: PORT });
    server.start();
    await new Promise((r) => setTimeout(r, 50));

    // A raw, unmasked client frame is a protocol violation that makes ws emit
    // 'error' on the server-side socket before any API key check finishes.
    await new Promise<void>((resolve) => {
      const sock = createConnection(PORT, "127.0.0.1", () => {
        sock.write(
          "GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n" +
            "x-api-key: wrong\r\n\r\n",
        );
        setTimeout(() => sock.write(Buffer.from([0x81, 0x02, 0x68, 0x69])), 20);
        setTimeout(() => {
          sock.destroy();
          resolve();
        }, 100);
      });
      sock.on("error", () => resolve());
    });

    const ws = await open();
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }));
    expect((await reply).result).toEqual({});
    ws.close();
  });

  it("answers a non-object JSON message with Invalid Request instead of crashing", async () => {
    server = new AuthBoxMCPServer(bridge(), { port: PORT });
    server.start();
    const ws = await open();
    await new Promise((r) => setTimeout(r, 20));

    for (const body of ["null", "42", "[]"]) {
      const reply = nextMessage(ws);
      ws.send(body);
      expect((await reply).error).toMatchObject({ code: -32600 });
    }
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }));
    expect((await reply).id).toBe(2);
    ws.close();
  });

  it("does not list services that an item_scope policy denies", async () => {
    server = new AuthBoxMCPServer(bridge(["GitHub", "Bank"]), { port: PORT });
    server.start();
    const ws = await open();
    await new Promise((r) => setTimeout(r, 20));

    const reply = nextMessage(ws);
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_available_services", arguments: {} },
      }),
    );
    const result = (await reply).result as { content: Array<{ text: string }> };
    expect(JSON.parse(result.content[0].text).services).toEqual(["GitHub"]);
    ws.close();
  });
});
