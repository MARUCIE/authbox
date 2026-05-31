# Auth Box — App Store Metadata

## App Name
Auth Box — AI Credential Hub

## Subtitle (30 chars max)
Passwords & API Keys for Devs

## Category
Primary: Utilities
Secondary: Productivity

## Price
Free (with $29 Pro IAP)

## Description

Auth Box is the credential hub built for developers and AI builders. Manage your passwords, API keys, and securely delegate credentials to AI agents — all encrypted with keys only you control.

ZERO-KNOWLEDGE SECURITY
Your vault is encrypted with AES-256-GCM on your device. We can't see your data — even if we wanted to. Recovery uses a 24-word seed phrase (the same proven model as Bitcoin wallets).

FOR DEVELOPERS
- Manage 70+ API provider keys (OpenAI, Anthropic, AWS, Stripe...)
- Drag-drop .env file import
- Health checks verify keys are valid and not expired
- Deterministic passwords: same seed + site = same password, offline

AI AGENT GATEWAY (Pro)
Give AI assistants controlled access to your credentials via MCP protocol. Set per-agent policies: which credentials, what actions, time windows, rate limits. Full audit trail.

IMPORT EVERYTHING
Migrate from 13 sources: Apple Keychain, Google, Chrome, 1Password, Bitwarden, LastPass, Dashlane, KeePass, and more.

WORKS WITHOUT US
Your vault works entirely offline. The server is optional. If Auth Box disappears tomorrow, your 24 words recover everything.

FREE FEATURES
- Unlimited local password storage
- Seed phrase generation & recovery
- Face ID / Touch ID unlock
- Deterministic password generator
- Apple Keychain import

PRO ($29, one-time)
- Multi-device sync
- All 13 import sources
- Unlimited API keys + health checks
- MCP Agent Gateway
- Arweave permanent backup
- Audit log

## Keywords (100 chars max)
password,manager,api,keys,developer,agent,mcp,seed,phrase,crypto,vault,security,autofill

## What's New (v1.0)
Initial release. Zero-knowledge password manager with BIP-39 seed phrase, deterministic passwords, AI Agent MCP Gateway, and 70+ API key management.

## Support URL
https://github.com/MARUCIE/10-auth-box/issues

## Privacy Policy URL
https://authbox.dev/privacy

## Screenshots Needed
1. Onboarding (dark theme, shield icon)
2. Create Vault - Seed phrase grid
3. Vault List (with category grouping)
4. Password Generator
5. Settings + Pro upgrade banner
6. Face ID unlock screen

## Rating
4+ (No objectionable content)

## App Review Notes
Auth Box is a zero-knowledge password manager. All encryption happens on-device using AES-256-GCM with keys derived from a BIP-39 seed phrase. The optional server component stores only encrypted blobs. Face ID is used for vault unlock (NSFaceIDUsageDescription configured). The app requires no special entitlements beyond AutoFill Credential Provider and App Groups for extension communication.
