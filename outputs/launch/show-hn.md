# Show HN: Auth Box -- The password manager that works even if we disappear

**Title**: Show HN: Auth Box -- Zero-knowledge password manager with AI credential gateway (24 words = all your passwords)

**URL**: https://github.com/MARUCIE/10-auth-box

---

**Post Body:**

Hi HN,

I built Auth Box because every password manager asks you to trust them. Auth Box asks you to trust math.

**The core idea**: Your vault is encrypted with keys derived from a BIP-39 seed phrase (same 24 words as Bitcoin wallets). If Auth Box the company disappears tomorrow, you still have all your passwords. No server dependency. No email required.

**What makes it different:**

1. **Seed phrase sovereignty** -- 24 words derive everything: vault key, auth key, per-agent delegation keys. Same proven model as crypto wallets.

2. **Deterministic passwords** -- Derive passwords from seed + site name. Your vault can literally be empty. `seed + "github.com" + "myuser" -> password`. Same seed = same password, every time.

3. **AI Agent gateway** -- Built-in MCP protocol server that gives AI assistants (Claude, GPT, etc.) controlled access to credentials. Policy engine with scope, rate limits, time windows, and step-up approval. You control what each agent can see.

4. **AI infrastructure credential hub** -- Manage API keys for 70+ providers (OpenAI, Anthropic, AWS, Stripe, Cloudflare, GitHub...) across 15 categories. Drag-drop a .env file and it auto-classifies everything. One-click health checks verify keys are valid.

5. **Zero-knowledge SRP-6a auth** -- Your master password never leaves your device. The server stores an SRP verifier (can't be reversed) and encrypted blobs (can't be decrypted). Even if the database leaks, attackers get nothing usable.

**Tech stack**: Go API + Next.js 15 + React 19 + Chrome MV3 Extension + Turborepo monorepo. 131 automated tests. Full-stack deployed on VPS via Cloudflare Tunnel.

**Security**: Passed a security audit (9 findings fixed including a TOTP bypass) and performance audit (composite indexes, cache limits). Per-email rate limiting, constant-time TOTP comparison, fixed-window rate limiter.

MIT licensed. Would love feedback from the HN security crowd on the threat model.

---

Maurice | maurice_wen@proton.me
