export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const authboxTools: ToolDefinition[] = [
  {
    name: "get_credential",
    description:
      'Retrieve a credential from the Auth Box vault. Returns credential fields filtered by the agent\'s access policy. Never returns the raw secret unless the policy explicitly allows "read" action.',
    inputSchema: {
      type: "object",
      properties: {
        service_name: {
          type: "string",
          description:
            'Name of the service to retrieve credentials for (e.g., "GitHub", "AWS")',
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific fields to retrieve. Omit to get all permitted fields.",
        },
      },
      required: ["service_name"],
    },
  },
  {
    name: "proxy_authenticated_request",
    description:
      "Make an authenticated HTTP request through Auth Box. The stored credential is injected into the request without exposing it to the agent. This is the preferred method for using credentials.",
    inputSchema: {
      type: "object",
      properties: {
        service_name: {
          type: "string",
          description:
            'Hostname or URL host whose credential to use for authentication (for example, "api.github.com")',
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          description: "HTTP method",
        },
        url: {
          type: "string",
          description: "Full URL to send the request to",
        },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description:
            "Additional HTTP headers (auth headers are injected automatically)",
        },
        body: {
          type: "string",
          description: "Request body (for POST/PUT/PATCH)",
        },
      },
      required: ["service_name", "method", "url"],
    },
  },
  {
    name: "list_available_services",
    description:
      "List all services that the user has stored credentials for. Returns service names only, no secrets. Useful for discovering what credentials are available before making requests.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export interface ProxyRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
