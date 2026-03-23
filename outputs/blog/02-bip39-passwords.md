# You Trust Your Crypto to 24 Words. Why Not Your Passwords?

> Your Bitcoin wallet can survive the apocalypse. Your 1Password vault cannot. Here is how to fix that.

---

## The Vendor Lock-In Nobody Talks About

You have a 1Password vault with 400 entries. Or maybe a Bitwarden export sitting in a JSON file somewhere. Either way, you are one corporate bankruptcy away from losing access to your entire digital life.

This is not hypothetical. LastPass was breached in 2022, and millions of encrypted vaults were exfiltrated. The company still exists, but the trust is gone. Now consider: what if they had shut down instead? Those vaults are encrypted with keys derived from your master password -- but the derivation parameters, the encryption format, the vault structure? All proprietary. All dependent on LastPass code existing somewhere.

The password manager industry has a dirty secret: **your vault is only as durable as the company that made it.** The encryption is solid, but the _format_ is a single point of failure.

Meanwhile, Bitcoin holders sleep soundly knowing that their entire fortune lives in 24 words, and any BIP-39-compatible wallet -- from any vendor, written in any language, on any device -- can restore it.

Why don't password managers work the same way?

## How Bitcoin Solved This Problem in 2013

BIP-39 (Bitcoin Improvement Proposal 39) introduced mnemonic seed phrases. The entire system is elegant in its simplicity:

1. Generate 256 bits of entropy
2. Map it to 24 human-readable words from a standardized 2048-word list
3. Convert words back to a seed using PBKDF2-HMAC-SHA512
4. Derive all keys deterministically from that seed

The critical insight: **the derivation is a pure function.** Same input, same output, every time, on every device, with every implementation. No server. No account. No vendor.

```
abandon ability able about above absent absorb abstract absurd abuse access accident
  |
  v
PBKDF2-HMAC-SHA512 (2048 iterations, salt = "mnemonic" + passphrase)
  |
  v
512-bit master seed
  |
  v
HMAC-SHA512 with domain-specific keys
  |
  v
m/44'/0'/0'/0/0  -> Bitcoin address #1
m/44'/0'/0'/0/1  -> Bitcoin address #2
m/44'/60'/0'/0/0 -> Ethereum address #1
... infinite deterministic derivation
```

Twelve years later, every hardware wallet, software wallet, and exchange supports this standard. You can write your seed phrase on a steel plate, bury it, and recover your funds twenty years later with software that does not exist yet. That is the power of a deterministic, vendor-neutral standard.

## Applying HD Key Derivation to Password Management

[Auth Box](https://github.com/MARUCIE/authbox) takes this exact model and applies it to passwords and credentials. The derivation tree looks like this:

```
seed phrase (24 words, BIP-39)
  |
  v
PBKDF2-HMAC-SHA512 (2048 rounds)
  |
  v
master seed (512 bits)
  |
  v
HMAC-SHA512("authbox seed", master_seed)
  |
  +-- m/ABX'/vault'/0'   -> vault encryption key (AES-256-GCM)
  +-- m/ABX'/sync'/0'    -> sync encryption key
  +-- m/ABX'/auth'/0'    -> authentication signing key (Ed25519)
  +-- m/ABX'/agent'/0'   -> agent delegation root key
  +-- m/ABX'/agent'/1'   -> per-agent sub-key (revocable)
  +-- m/ABX'/derive'/n'  -> deterministic password for site n
```

Each branch serves a distinct purpose, and the hardened derivation (note the `'` apostrophes) ensures that compromising one branch cannot reveal any other. This is the same security property that prevents someone who knows your Bitcoin address from deriving your Ethereum keys.

### The Implementation

The core is roughly 60 lines of TypeScript built on `@noble/hashes` (a well-audited, pure-JS crypto library):

```typescript
// BIP-39 mnemonic -> 512-bit seed
function mnemonicToSeed(mnemonic: string, passphrase: string = ''): Uint8Array {
  const mnemonicBytes = encode(mnemonic.normalize('NFKD'));
  const salt = encode('mnemonic' + passphrase.normalize('NFKD'));
  return pbkdf2(sha512, mnemonicBytes, salt, { c: 2048, dkLen: 64 });
}

// HD key derivation with Auth Box custom purpose
function deriveKey(seed: Uint8Array, purpose: KeyPurpose, index: number = 0): Uint8Array {
  const master = masterKeyFromSeed(seed);         // HMAC-SHA512("authbox seed", seed)
  const purposeNode = deriveHardenedChild(master, AUTH_BOX_PURPOSE); // "ABX\0"
  const typeNode = deriveHardenedChild(purposeNode, purpose);
  const leaf = deriveHardenedChild(typeNode, index);
  return leaf.key; // 32-byte derived key
}
```

The `AUTH_BOX_PURPOSE` constant (`0x41425800`, which is `"ABX\0"` as a uint32) acts as a namespace separator, ensuring Auth Box derivation paths never collide with Bitcoin (purpose `44'`) or Ethereum (purpose `60'`) even if derived from the same seed phrase.

### Deterministic Passwords: The Radical Part

Here is where it gets interesting. Traditional password managers _store_ your passwords. Auth Box can _derive_ them:

```typescript
function derivePassword(seed: Uint8Array, site: string, options = {}): string {
  // 1. Hash the site name to get a deterministic index
  const siteHash = sha256(site.toLowerCase() + '\0' + counter);
  const siteIndex = uint32(siteHash);

  // 2. Derive site-specific key material via HD path
  const siteKey = deriveKey(seed, KeyPurpose.DERIVE, siteIndex);

  // 3. Expand to password characters
  const expanded = hmac(sha512, siteKey, 'password:' + site + ':' + counter);

  // 4. Map bytes to character set (a-z, A-Z, 0-9, symbols)
  return mapToCharset(expanded, charset, length);
}
```

The result: `derivePassword(seed, "github.com")` always produces the same 20-character password. No vault needed. No sync needed. No server needed. If you have your 24 words and you know the site name, you have the password.

The `counter` parameter handles the inevitable "please change your password" scenario -- increment it from 0 to 1, and you get a completely different password for the same site.

## The Unstoppable Promise

Auth Box makes a guarantee that no traditional password manager can:

**Even if Auth Box ceases to exist -- the company, the servers, the code, the domain -- your 24 words will still recover every password.**

This works across five degradation levels:

| Level | Scenario | What Still Works |
|-------|----------|-----------------|
| 0 | Everything online | Full app: web UI, sync, AI gateway, audit |
| 1 | Servers go down | Local vault + Chrome extension + deterministic passwords |
| 2 | Company disappears | Arweave recovery: fetch encrypted blob, decrypt with seed |
| 3 | Device lost | Seed phrase + Arweave = full restore on a new device |
| 4 | Everything gone | Seed phrase alone = derive passwords with any HMAC calculator |

Level 4 is the nuclear option. No internet, no vault, no software. Just 24 words and the publicly documented derivation algorithm. A developer could reimplement the password derivation function in an afternoon using any language with HMAC-SHA512 support.

### Arweave: Your Vault Outlives Your Vendor

For the full vault (not just derived passwords, but stored credentials, notes, API keys), Auth Box archives encrypted snapshots to Arweave -- a permanent, decentralized storage network. One-time payment of roughly $0.005/KB. No subscriptions. No renewals. The data persists for 200+ years by design.

The encrypted blob on Arweave is useless without your seed phrase. Arweave nodes see only ciphertext. But with your 24 words, you derive the vault key, fetch the blob, decrypt locally, and recover everything.

```
Recovery flow:
  24 words -> derive vault_key (m/ABX'/vault'/0')
            -> fetch encrypted blob from Arweave
            -> AES-256-GCM decrypt locally
            -> full vault restored
```

## Auth Box vs. LessPass: Stateless Password Derivation Compared

LessPass pioneered stateless password derivation in 2016. Auth Box builds on that idea but extends it significantly:

| Feature | LessPass | Auth Box |
|---------|----------|----------|
| Stateless password derivation | Yes (master password + site + username) | Yes (seed phrase + site + counter) |
| Recovery mechanism | Remember master password | 24-word seed phrase (BIP-39 standard) |
| Full vault storage | No (stateless only) | Yes (AES-256-GCM encrypted vault) |
| Permanent backup | No | Arweave on-chain archive |
| AI agent delegation | No | Per-agent derived keys with policy engine |
| Key hierarchy | Flat (single master password) | HD tree (vault/sync/auth/agent/derive branches) |
| Key revocation | Change master password (changes everything) | Revoke individual agent keys by index |
| Import from other managers | No | 13 sources (1Password, Chrome, Bitwarden, etc.) |
| Open standard for derivation | Custom (PBKDF2 + site params) | BIP-39 + BIP-32-style HD derivation |

The key difference: LessPass is _only_ stateless derivation. If a site requires you to store a note, an API key, or a TOTP secret, LessPass cannot help. Auth Box gives you both modes -- deterministic derivation for passwords, plus a full encrypted vault for everything else -- and both are recoverable from the same 24 words.

## Try It Yourself

Auth Box is open source under the MIT license.

```bash
git clone https://github.com/MARUCIE/authbox.git
cd authbox
pnpm install
make dev
```

The web app starts at `http://localhost:3010`. Create a vault, write down your 24 words, and try the deterministic password derivation. Then delete the vault and restore it from the seed phrase. The passwords come back identical.

The cryptographic core lives in `packages/crypto/src/seed.ts` -- about 340 lines of TypeScript with no dependencies beyond `@noble/hashes`. Read it. Audit it. Reimplement it in Rust or Go or Python. That is the whole point: the derivation algorithm is simple enough to verify, standard enough to reimplement, and deterministic enough to trust with your passwords.

**Your crypto lives in 24 words. Your passwords should too.**

GitHub: [https://github.com/MARUCIE/authbox](https://github.com/MARUCIE/authbox)

---

Maurice | maurice_wen@proton.me
