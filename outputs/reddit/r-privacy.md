# r/privacy Post

**Title**: I built a password manager that doesn't need your email, doesn't need a server, and works with just 24 words

**Body**:

Every password manager asks you to create an account, verify your email, and trust their servers. I wanted the opposite.

**Auth Box** is an open-source password manager where:

- **No email required** -- create a vault with just a seed phrase and master password. 45 seconds.
- **No server dependency** -- your vault is encrypted locally with keys derived from your seed phrase. The server is optional.
- **No vendor lock-in** -- if Auth Box disappears tomorrow, your 24 words can recover everything.
- **Zero-knowledge auth** -- SRP-6a protocol means your master password never leaves your device. The server stores a mathematical verifier that can't be reversed.

**How it's different from Bitwarden/1Password**:

| | 1Password | Bitwarden | Auth Box |
|---|---|---|---|
| Needs email | Yes | Yes | No |
| Works without server | No | Self-host only | Yes |
| Deterministic passwords | No | No | Yes |
| Seed phrase recovery | No | No | Yes |
| Open source | No | Yes | Yes (MIT) |

The insight is simple: if a 24-word seed phrase can secure millions in Bitcoin, it can secure your passwords.

GitHub: https://github.com/MARUCIE/authbox

MIT licensed. Would love feedback from the privacy community.
