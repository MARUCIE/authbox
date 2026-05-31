import { describe, expect, it } from "vitest";
import { sanitizeProxyRequest } from "./proxy-security";

const publicLookup = async () => ["93.184.216.34"];

describe("sanitizeProxyRequest", () => {
  it("allows public HTTPS requests bound to the service host", async () => {
    const req = await sanitizeProxyRequest(
      "api.example.com",
      {
        method: "post",
        url: "https://api.example.com/v1/messages",
        headers: { "Content-Type": "application/json" },
        body: '{"ok":true}',
      },
      { lookupHostname: publicLookup },
    );

    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.example.com/v1/messages");
    expect(req.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("denies localhost and private network SSRF targets", async () => {
    await expect(
      sanitizeProxyRequest(
        "http://localhost",
        { method: "GET", url: "http://localhost:4010/health" },
        { lookupHostname: publicLookup },
      ),
    ).rejects.toThrow("host is not allowed");

    await expect(
      sanitizeProxyRequest(
        "api.example.com",
        { method: "GET", url: "https://api.example.com/metadata" },
        { lookupHostname: async () => ["169.254.169.254"] },
      ),
    ).rejects.toThrow("private address");
  });

  it("denies requests whose URL host is not bound to service_name", async () => {
    await expect(
      sanitizeProxyRequest(
        "api.github.com",
        { method: "GET", url: "https://evil.example.com/user" },
        { lookupHostname: publicLookup },
      ),
    ).rejects.toThrow("host must match service_name");
  });

  it("denies agent-supplied credential and hop-by-hop headers", async () => {
    await expect(
      sanitizeProxyRequest(
        "api.example.com",
        {
          method: "GET",
          url: "https://api.example.com/user",
          headers: { Authorization: "Bearer stolen" },
        },
        { lookupHostname: publicLookup },
      ),
    ).rejects.toThrow("header is not allowed");
  });

  it("denies request bodies on safe proxy methods", async () => {
    await expect(
      sanitizeProxyRequest(
        "api.example.com",
        {
          method: "GET",
          url: "https://api.example.com/user",
          body: "exfiltrate",
        },
        { lookupHostname: publicLookup },
      ),
    ).rejects.toThrow("body is not allowed");
  });
});
