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

  it("denies IPv6 forms of private and metadata addresses", async () => {
    const blocked = [
      "::ffff:169.254.169.254", // IPv4-mapped cloud metadata
      "::ffff:a9fe:a9fe", // same, written in hex
      "::ffff:a00:1", // 10.0.0.1 in hex
      "::ffff:172.16.0.1",
      "::ffff:100.64.0.1",
      "::ffff:0.0.0.0",
      "::127.0.0.1", // IPv4-compatible
      "64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
      "2002:a9fe:a9fe::1", // 6to4 of 169.254.169.254
      "fec0::1",
      "100::1", // discard prefix
      "fe80::1%eth0",
      "fd00::1",
      "::1",
      "::",
      "0:0:0:0:0:0:0:1",
      "not-an-ip",
    ];
    for (const address of blocked) {
      await expect(
        sanitizeProxyRequest(
          "api.example.com",
          { method: "GET", url: "https://api.example.com/x" },
          { lookupHostname: async () => [address] },
        ),
        address,
      ).rejects.toThrow();
    }

    for (const address of ["2606:4700::1111", "::ffff:93.184.216.34", "64:ff9b::808:808"]) {
      await expect(
        sanitizeProxyRequest(
          "api.example.com",
          { method: "GET", url: "https://api.example.com/x" },
          { lookupHostname: async () => [address] },
        ),
        address,
      ).resolves.toBeDefined();
    }
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
