# X/Twitter Launch Thread

## Thread (10 tweets)

### 1/10
I just open-sourced Auth Box -- a password manager that works even if we disappear.

24 words. That's all you need to recover every password. No email. No account. No server.

The same model Bitcoin uses to secure billions.

### 2/10
Every password manager asks you to trust them. 1Password. Bitwarden. Apple Keychain.

Auth Box asks you to trust math.

Your vault is encrypted with keys derived from a BIP-39 seed phrase. The server stores encrypted blobs it can never decrypt.

### 3/10
The killer feature: deterministic passwords.

seed + "github.com" + "myuser" = your password

Same seed, same password, every time. Your vault can literally be empty. Just derive.

This is how crypto wallets work. Now it's how passwords work.

### 4/10
But I didn't stop at passwords.

AI agents need API keys. Lots of them. OpenAI, Anthropic, AWS, Stripe, GitHub...

Auth Box manages 70+ provider credentials across 15 categories.

Drag-drop a .env file. It auto-classifies everything. One-click health checks.

### 5/10
The MCP gateway gives AI agents controlled access to your credentials:

- Scope: which services they can see
- Rate limits: how often they can access
- Time windows: when they can access
- Step-up approval: you confirm before sensitive operations

Agent credentials, not agent chaos.

### 6/10
SRP-6a authentication means your password NEVER leaves your device.

The server stores a mathematical verifier that can't be reversed. Even if our database leaks, attackers get nothing usable.

Zero knowledge isn't marketing. It's the architecture.

### 7/10
131 automated tests. ALL PASS.

- Go API: 25 tests (SRP + rate limiter + security middleware)
- Crypto: 53 tests (AES-GCM + BIP-39 + Arweave vault)
- E2E: 53 tests (real SRP login + full CRUD lifecycle)

Plus a security audit with 9 findings fixed.

### 8/10
Import from 13 sources:

Apple, Google, Chrome, Edge, Firefox, 1Password, Bitwarden, LastPass, Dashlane, KeePass, Samsung Pass, NordPass, Enpass.

Or just paste your .env file. 100+ env var patterns auto-detected.

Migration takes 30 seconds.

### 9/10
Tech stack for the nerds:

- Go 1.22+ API (chi, pgx, DDD layered)
- Next.js 15 + React 19 (Vault Onyx design system)
- Chrome MV3 Extension (autofill + MCP gateway)
- Turborepo monorepo (7 packages)
- Arweave permanent storage (your vault survives forever)

### 10/10
MIT licensed. No vendor lock-in. No subscription trap.

Your keys. Your identity. Unstoppable.

GitHub: github.com/MARUCIE/10-auth-box
