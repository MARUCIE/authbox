#!/usr/bin/env node
/**
 * Standalone stdio MCP server for tool discovery and inspection.
 * Used by Glama and other MCP clients to detect available tools.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "authbox-vault",
  version: "2.0.0",
});

server.tool(
  "get_credential",
  'Retrieve a credential from the Auth Box vault. Returns credential fields filtered by the agent\'s access policy. Never returns the raw secret unless the policy explicitly allows "read" action.',
  {
    service_name: z
      .string()
      .describe(
        'Name of the service to retrieve credentials for (e.g., "GitHub", "AWS")',
      ),
    fields: z
      .array(z.string())
      .optional()
      .describe(
        "Specific fields to retrieve. Omit to get all permitted fields.",
      ),
  },
  async ({ service_name, fields }) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error:
            "Vault bridge not configured. Connect to a running Auth Box instance.",
        }),
      },
    ],
  }),
);

server.tool(
  "proxy_authenticated_request",
  "Make an authenticated HTTP request through Auth Box. The stored credential is injected into the request without exposing it to the agent. This is the preferred method for using credentials.",
  {
    service_name: z
      .string()
      .describe(
        'Hostname or URL host whose credential to use for authentication (for example, "api.github.com")',
      ),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .describe("HTTP method"),
    url: z.string().describe("Full URL to send the request to"),
    headers: z
      .record(z.string())
      .optional()
      .describe(
        "Additional HTTP headers (auth headers are injected automatically)",
      ),
    body: z.string().optional().describe("Request body (for POST/PUT/PATCH)"),
  },
  async () => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error:
            "Vault bridge not configured. Connect to a running Auth Box instance.",
        }),
      },
    ],
  }),
);

server.tool(
  "list_available_services",
  "List all services that the user has stored credentials for. Returns service names only, no secrets. Useful for discovering what credentials are available before making requests.",
  {},
  async () => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error:
            "Vault bridge not configured. Connect to a running Auth Box instance.",
        }),
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
