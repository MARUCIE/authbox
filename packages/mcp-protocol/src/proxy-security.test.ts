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
    // The vetted addresses are pinned for the bridge (DNS-rebinding defense).
    expect(req.resolvedAddresses).toEqual(["93.184.216.34"]);
  });

  it("denies localhost and private network SSRF targets", async () => {
    await expect(
      sanitizeProxyRequest(
        "https://localhost",
        { method: "GET", url: "https://localhost:4010/health" },
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

  it("denies plaintext http destinations", async () => {
    await expect(
      sanitizeProxyRequest(
        "api.example.com",
        { method: "GET", url: "http://api.example.com/user" },
        { lookupHostname: publicLookup },
      ),
    ).rejects.toThrow("must use https");
  });

  it("denies IPv4-mapped/translated IPv6 forms of private addresses", async () => {
    const privateMappedForms = [
      "::ffff:169.254.169.254", // dotted IPv4-mapped (cloud metadata)
      "::ffff:a9fe:a9fe", // hex IPv4-mapped equivalent
      "::ffff:172.16.0.1", // RFC1918 range previously unblocked
      "64:ff9b::a9fe:a9fe", // NAT64 well-known prefix
      "2002:7f00:1::1", // 6to4 embedding 127.0.0.1
      "fe9f::1", // inside fe80::/10 but not literal "fe80:"
    ];

    for (const address of privateMappedForms) {
      await expect(
        sanitizeProxyRequest(
          "api.example.com",
          { method: "GET", url: "https://api.example.com/x" },
          { lookupHostname: async () => [address] },
        ),
      ).rejects.toThrow("private address");
    }

    // Regular public IPv6 must still pass.
    await expect(
      sanitizeProxyRequest(
        "api.example.com",
        { method: "GET", url: "https://api.example.com/x" },
        { lookupHostname: async () => ["2606:4700:4700::1111"] },
      ),
    ).resolves.toBeTruthy();
  });

  it("denies header values containing CR/LF injection", async () => {
    await expect(
      sanitizeProxyRequest(
        "api.example.com",
        {
          method: "GET",
          url: "https://api.example.com/user",
          headers: { "X-Trace": "abc\r\nAuthorization: Bearer smuggled" },
        },
        { lookupHostname: publicLookup },
      ),
    ).rejects.toThrow("header value is invalid");
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
