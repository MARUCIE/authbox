# Auth Box v3 Launch Kit

## Product Hunt Listing

### Tagline (60 chars max)
The password manager that works even if we disappear.

### Description
Auth Box is the first password manager built on Bitcoin wallet principles. Your vault is protected by a 24-word seed phrase -- not an email, not a server, not us.

**What makes it different:**

- **No signup needed**: Generate a seed phrase in 45 seconds. No email, no account.
- **Passwords without storage**: Derive passwords deterministically from your seed + site name. Your vault can be literally empty.
- **Survive without us**: If Auth Box disappears tomorrow, your 24 words still unlock everything. We can't lock you out -- by design.
- **AI Agent gateway**: Let Claude, GPT, or any AI assistant securely use your credentials through MCP protocol, with policy controls and full audit.
- **Import everything**: Migrate from 13 password managers including Apple, Google, Chrome, 1Password, Bitwarden, LastPass, and more.

Open source (MIT). Zero knowledge. Unstoppable.

### First Comment (Maker Post)

Hi HN / Product Hunt!

I'm Maurice. I built Auth Box because I was tired of trusting companies with my most sensitive data.

Every password manager says "trust us, your data is safe." But what happens when the company gets acquired? Shuts down? Gets hacked? (Remember LastPass 2022?)

Auth Box takes a different approach: **you don't need to trust us at all.**

Your vault is encrypted with keys derived from a 24-word seed phrase -- the same model Bitcoin has used for 15 years. If Auth Box disappears, your passwords don't.

The most radical feature: **deterministic password derivation**. Type a site name, get a password. Same seed + same site = same password, every time. You don't even need to store passwords. Your vault can be empty.

I'd love feedback on:
1. Would you trust a password manager with no email signup?
2. Is "passwords without storage" compelling or confusing?
3. Would you pay $4.99/month for AI Agent delegation + cloud sync?

Tech stack: Next.js 15, Go, PostgreSQL, @noble/hashes (BIP-39, AES-256-GCM, SRP-6a).

---

## Show HN Post

### Title
Show HN: Auth Box -- The password manager that works even if we disappear

### Body
Auth Box is a zero-knowledge password manager built on Bitcoin wallet principles.

Key innovation: Your vault is protected by a 24-word seed phrase (BIP-39). All keys are derived deterministically via HD key derivation (BIP-32 style). No email, no account, no server dependency.

The most radical feature: deterministic password derivation. `seed + "github.com" -> password`. Same seed always produces the same password. Your vault can be empty.

Why this matters:
- If Auth Box disappears, you still have your passwords (24 words = everything)
- No email = no identity to leak
- AI agents can use your credentials via MCP protocol with policy controls
- Import from 13 password managers (1Password, Bitwarden, Chrome, etc.)

Architecture: Next.js 15 + Go API + PostgreSQL. Encryption: BIP-39, Argon2id, HKDF, AES-256-GCM, SRP-6a. Tests: 27 passing. MIT licensed.

Live: https://authbox.io
Source: https://github.com/MARUCIE/10-auth-box

I'd love to hear what the HN community thinks about "passwords without storage" as a concept.

---

## Demo Video Script (60 seconds)

### Scene 1: Problem (0-10s)
[Screen: password manager logos fading out]
"Every password manager asks you to trust them.
But what happens when they disappear?"

### Scene 2: Solution (10-20s)
[Screen: Auth Box /create page]
"Auth Box is different. 24 words. That's all you need."
[Click: Generate Recovery Phrase]
[Screen: 24-word grid appears]
"No email. No account. No server."

### Scene 3: Magic Moment (20-35s)
[Screen: /passwords page, click "Derive"]
"Watch this. Type a site name..."
[Type: github.com]
[Password appears instantly]
"Same seed, same site, same password. Every time.
Your vault can be empty."

### Scene 4: The Promise (35-50s)
[Screen: Settings > Unstoppable Mode]
"Even if Auth Box disappears tomorrow...
your 24 words still unlock everything."
[Screen: /restore page, paste 24 words]
"Full recovery. Offline. No server needed."

### Scene 5: CTA (50-60s)
[Screen: Landing page hero]
"Your Keys. Your Identity. Unstoppable.
Auth Box. Open source. Free to start."
[URL: authbox.io]

---

## Twitter/X Thread

### Tweet 1 (Hook)
I built a password manager that works even if my company disappears.

No email. No signup. Just 24 words.

Here's why and how: (thread)

### Tweet 2 (Problem)
Every password manager says "trust us."

But LastPass got hacked in 2022.
Companies get acquired. Servers shut down.
Your passwords die with them.

### Tweet 3 (Solution)
Auth Box uses the same model as Bitcoin wallets.

24-word seed phrase -> all your encryption keys.

If you have your words, you have everything.
No server. No company. No dependency.

### Tweet 4 (Killer Feature)
The wildest part?

You don't even need to STORE passwords.

seed + "github.com" -> password

Same seed. Same site. Same password. Every time.
Your vault can be literally empty.

### Tweet 5 (AI Angle)
Auth Box also lets AI agents use your credentials.

But they never see the actual passwords.
They get delegated keys with scope + time + amount limits.
Every action is audited.

### Tweet 6 (Trust Signal)
MIT licensed. Open source.
Encryption format is public.
Anyone can write a decryption tool.

We gave you the ability to leave us.
That's why you should stay.

### Tweet 7 (CTA)
Auth Box v3 is live.
Free. Open source. Unstoppable.

github.com/MARUCIE/10-auth-box
authbox.io

Your keys. Your identity.

---

## Screenshot Captions (for PH gallery)

1. **01-hero.png**: "Your Keys. Your Identity. Unstoppable." -- Landing page with three pillars of digital identity and the Unstoppable Promise.

2. **02-create-vault.png**: 45-second vault creation. No email, no signup. Just a seed phrase and a master password.

3. **03-login-srp.png**: SRP-6a handshake visualization. Watch mutual authentication happen in real-time. Server never sees your password.

4. **04-restore.png**: Full vault recovery from seed phrase. Works offline, no server needed. Paste 24 words and you're back.

---

Maurice | maurice_wen@proton.me
