# Your Password Never Leaves Your Device: Implementing SRP-6a in a Zero-Knowledge Password Manager

Every major password breach follows the same script: attackers compromise a server, dump the password database, and crack hashes offline. LinkedIn (2012, 117M SHA-1 hashes). LastPass (2022, encrypted vaults exfiltrated). The root cause is always the same -- the server had something worth stealing.

What if the server never received the password at all?

That is the premise behind [Auth Box](https://github.com/MARUCIE/authbox), an open-source zero-knowledge password manager. Its authentication layer uses SRP-6a (Secure Remote Password, revision 6a), a protocol where the client proves it knows the password without ever transmitting it. The server stores only a mathematical derivative called a *verifier* -- useless without the original password.

This post walks through the actual implementation: TypeScript on the client, Go on the server, and the security decisions that matter.

## Why Traditional Password Auth Is Broken

The standard model looks like this:

1. User types password
2. Client sends password (or its hash) to server over TLS
3. Server hashes and compares against stored hash (bcrypt, argon2, etc.)
4. Server returns a session token

The problem is structural. The password -- or enough information to reconstruct it -- crosses the wire and exists in server memory, even if only for milliseconds. This creates attack surfaces at every layer:

- **TLS termination**: corporate proxies, CDN edge nodes, or compromised load balancers can intercept plaintext.
- **Server-side logging**: an accidental `console.log(req.body)` or a verbose WAF leaks credentials into log stores.
- **Database breaches**: even with argon2id, offline attackers can crack weak passwords given enough GPU time.
- **Credential stuffing**: once a password hash leaks from one service, it can be tested against every other service the user has an account with.

SRP eliminates the first two entirely. The password never leaves the client. The server never sees it, not even transiently. For the third attack surface, even if the verifier database is stolen, an attacker cannot reverse it into the original password or use it to impersonate the client -- the verifier alone is not sufficient to complete authentication.

## How SRP-6a Works

SRP (Secure Remote Password) was designed by Tom Wu at Stanford in 1998. Version 6a, specified in [RFC 5054](https://tools.ietf.org/html/rfc5054), fixes subtle vulnerabilities in earlier revisions. The key properties:

1. **Zero-knowledge**: The server never learns the password. Not during registration, not during login, not ever.
2. **Mutual authentication**: The client proves it knows the password, AND the server proves it has the correct verifier. A MITM server cannot fake the handshake.
3. **No password-equivalent stored on the server**: The verifier `v` is a one-way derivation. Stealing it does not let an attacker log in.
4. **Resistance to offline dictionary attacks**: An eavesdropper who captures the full handshake transcript cannot mount an offline attack without the verifier.

The protocol works in two phases: **registration** and **login**.

### Registration

The client computes a verifier from the password and sends it to the server. The password itself never crosses the wire.

```
x = H(salt || H(email || ":" || password))
v = g^x mod N
Client sends: (salt, v) to server
Server stores: (salt, v) per user
```

Here, `N` is a large safe prime and `g` is a generator of the multiplicative group modulo N. Auth Box uses the 2048-bit group from RFC 5054 (Group 14).

### Login (the handshake)

This is a four-message exchange where both sides independently derive the same session key without revealing the password:

```
Step 1: Client generates ephemeral keypair
        a = random, A = g^a mod N
        Client sends: (email, A) to server

Step 2: Server looks up (salt, v) for email
        b = random, B = k*v + g^b mod N
        Server sends: (salt, B) to client

Step 3: Both sides compute the shared secret S
        Client: S = (B - k * g^x) ^ (a + u*x) mod N
        Server: S = (A * v^u) ^ b mod N
        Both derive: K = H(S)

Step 4: Mutual proof
        Client sends: M1 = H(A || B || K)
        Server verifies M1, responds: M2 = H(A || M1 || K)
        Client verifies M2
```

The multiplier `k = H(N || PAD(g))` and scrambling parameter `u = H(PAD(A) || PAD(B))` are the "6a" additions that prevent two-for-one guessing attacks and other weaknesses in earlier SRP versions.

## The Implementation

### Shared Constants: RFC 5054 Group Parameters

Both client and server must use identical group parameters. We use the 2048-bit prime from RFC 5054 Appendix A:

**TypeScript (client):**
```typescript
// RFC 5054, 2048-bit group 14
const N_HEX =
  'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050' +
  'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50' +
  // ... (256 bytes total)
  '94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73';

const N = BigInt('0x' + N_HEX);
const g = 2n;
```

**Go (server):**
```go
srpN, _ = new(big.Int).SetString(
    "AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050"+
    // ... same 2048-bit prime
    "94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73", 16)

srpG = big.NewInt(2)
srpK = computeK(srpN, srpG)  // k = H(N || PAD(g))
```

The `k` multiplier is precomputed at init time since N and g are fixed.

### Client Side: TypeScript with Native BigInt

The client implementation lives in `@authbox/crypto` and uses `@noble/hashes` for SHA-256. No WebAssembly, no heavy dependencies -- just native BigInt arithmetic.

**Modular exponentiation** (the workhorse of SRP):

```typescript
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) {
      result = (result * base) % mod;
    }
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}
```

**Registration** -- generate the verifier:

```typescript
export async function srpGenerateVerifier(
  email: string, password: string, salt: Uint8Array,
): Promise<{ salt: Uint8Array; verifier: Uint8Array }> {
  const x = computeX(email, password, salt);
  const verifier = modPow(g, x, N);
  return {
    salt: new Uint8Array(salt),
    verifier: bigintToBytes(verifier, 256), // pad to N's byte length
  };
}
```

**Login step 1** -- generate ephemeral keypair with safety check:

```typescript
export async function srpClientInit(): Promise<SRPClientState> {
  let a: bigint;
  let A: bigint;
  do {
    const aBytes = crypto.getRandomValues(new Uint8Array(32));
    a = bytesToBigint(aBytes);
    A = modPow(g, a, N);
  } while (A === 0n); // SRP safety: A mod N must not be 0
  return {
    ephemeralSecret: bigintToBytes(a, 32),
    ephemeralPublic: bigintToBytes(A, 256),
  };
}
```

**Login step 2** -- compute the proof:

```typescript
export async function srpClientVerify(
  state: SRPClientState, email: string, password: string,
  salt: Uint8Array, serverPublicB: Uint8Array,
): Promise<{ clientProof: Uint8Array; sessionKey: Uint8Array }> {
  const a = bytesToBigint(state.ephemeralSecret);
  const A = bytesToBigint(state.ephemeralPublic);
  const B = bytesToBigint(serverPublicB);

  if (B % N === 0n) throw new Error('SRP: invalid server public key');

  const u = computeU(A, B);
  if (u === 0n) throw new Error('SRP: scrambling parameter u is zero');

  const x = computeX(email, password, salt);
  const k = computeK();

  // S = (B - k * g^x) ^ (a + u*x) mod N
  const gx = modPow(g, x, N);
  const kgx = (k * gx) % N;
  const base = ((B - kgx) % N + N) % N;  // ensure non-negative
  const S = modPow(base, a + u * x, N);

  const sessionKey = hashSHA256(bigintToBytes(S, 256));
  const clientProof = hashSHA256(
    bigintToBytes(A, 256), bigintToBytes(B, 256), sessionKey,
  );
  return { clientProof, sessionKey };
}
```

### Server Side: Go with crypto/rand

The server creates a session from the stored verifier and verifies the client's proof.

**Session init** -- compute B:

```go
func NewSRPServer(verifier []byte) (*SRPServer, error) {
    v := new(big.Int).SetBytes(verifier)
    if v.Sign() == 0 {
        return nil, errors.New("srp: zero verifier")
    }

    b, err := randBigInt(256) // 256 bits of entropy from crypto/rand
    if err != nil {
        return nil, err
    }

    // B = k*v + g^b mod N
    kv := new(big.Int).Mul(srpK, v)
    gb := new(big.Int).Exp(srpG, b, srpN)
    B := new(big.Int).Add(kv, gb)
    B.Mod(B, srpN)

    if B.Sign() == 0 {
        return nil, errors.New("srp: B is zero")
    }
    return &SRPServer{verifier: v, b: b, B: B}, nil
}
```

**Proof verification** -- the critical code path:

```go
func (s *SRPServer) VerifyProof(clientA, clientM1 []byte) ([]byte, error) {
    A := new(big.Int).SetBytes(clientA)

    // Safety: A mod N != 0
    if new(big.Int).Mod(A, srpN).Sign() == 0 {
        return nil, errors.New("srp: A mod N is zero")
    }

    u := computeU(A, s.B)
    if u.Sign() == 0 {
        return nil, errors.New("srp: u is zero")
    }

    // S = (A * v^u)^b mod N
    vu := new(big.Int).Exp(s.verifier, u, srpN)
    avu := new(big.Int).Mul(A, vu)
    avu.Mod(avu, srpN)
    S := new(big.Int).Exp(avu, s.b, srpN)

    nLen := len(srpN.Bytes())
    K := hashBytes(padTo(S, nLen))

    expectedM1 := hashBytes(padTo(A, nLen), padTo(s.B, nLen), K)

    if !constantTimeEqual(expectedM1, clientM1) {
        return nil, errors.New("srp: client proof invalid")
    }

    // Mutual auth: M2 = H(A | M1 | K)
    M2 := hashBytes(padTo(A, nLen), clientM1, K)
    return M2, nil
}
```

### The Full Login Flow (HTTP level)

The login is a two-round-trip exchange:

```
POST /api/auth/login/init     { email, clientPublicA }
                           --> { srpSalt, serverPublicB }

POST /api/auth/login/verify   { email, clientPublicA, clientProofM1 }
                           --> { sessionToken, serverProofM2, encryptedVaultKey }
```

The client verifies M2 locally. If the server is an impersonator, M2 will not match and the client aborts. Mutual authentication complete.

## Security Considerations

Getting the math right is necessary but not sufficient. Here are the implementation details that prevent real-world attacks:

### 1. Constant-Time Comparison

Comparing M1 proof bytes must be constant-time to prevent timing side-channels:

```go
func constantTimeEqual(a, b []byte) bool {
    if len(a) != len(b) {
        return false
    }
    var v byte
    for i := range a {
        v |= a[i] ^ b[i]
    }
    return v == 0
}
```

An early-return comparison leaks how many bytes matched, which can be exploited byte-by-byte to forge a valid proof.

### 2. Validating A mod N != 0 and B mod N != 0

If `A mod N == 0`, the server's computation degenerates: the shared secret becomes 0 regardless of the password. An attacker could send `A = 0` or `A = N` or `A = 2N` to bypass authentication. The same applies to B on the client side.

Both sides must reject these values before proceeding.

### 3. Padding to Fixed Length

All BigInt-to-bytes conversions are padded to the full byte length of N (256 bytes for a 2048-bit group). Without padding, `H(A || B)` could collide with `H(A' || B')` when leading zero bytes are dropped.

```go
func padTo(n *big.Int, length int) []byte {
    b := n.Bytes()
    if len(b) >= length {
        return b
    }
    padded := make([]byte, length)
    copy(padded[length-len(b):], b)
    return padded
}
```

### 4. Verifier == Asymmetric Secret

The verifier `v = g^x mod N` acts like a public key: the server can verify proofs with it, but cannot derive the password from it. Even if the verifier database is exfiltrated, the attacker must solve the discrete logarithm problem (in a 2048-bit group) to recover the password -- computationally infeasible.

### 5. Rate Limiting and Anti-Enumeration

SRP does not protect against online brute-force. Auth Box adds per-email rate limiting (5 attempts per 5-minute window) and returns identical error messages for "user not found" and "wrong password" to prevent email enumeration.

## What We Learned

Building SRP-6a from scratch (rather than using a library) forced decisions that would otherwise be invisible:

- **BigInt is production-ready in browsers**: Native `BigInt` arithmetic in TypeScript is fast enough for 2048-bit modular exponentiation. No WASM needed.
- **Padding is the silent killer**: The most insidious bug was not padding `g` to N's byte length when computing `k = H(N || PAD(g))`. Client and server computed different `k` values and the handshake silently failed. Both sides must use identical padding.
- **Session key derivation matters**: We derive `K = H(S)` rather than using `S` directly. The raw shared secret has algebraic structure; hashing it produces a uniformly distributed key suitable for symmetric crypto.
- **Test the full round-trip in a single language first**: Our Go test file includes a `computeClientSide` function that mirrors the TypeScript client. This catches cross-language mismatches (endianness, padding, hash input ordering) before they hit the network.

## Try It Yourself

Auth Box is open source under the MIT license:

**Repository**: [github.com/MARUCIE/authbox](https://github.com/MARUCIE/authbox)

Key files for the SRP implementation:

| File | Language | Role |
|------|----------|------|
| `packages/crypto/src/srp.ts` | TypeScript | Client-side SRP-6a (BigInt + @noble/hashes) |
| `services/api/internal/auth/srp.go` | Go | Server-side SRP-6a (crypto/rand + math/big) |
| `services/api/internal/auth/srp_test.go` | Go | Round-trip tests (6 test cases) |
| `apps/web/lib/auth.ts` | TypeScript | Full registration and login flows |

To run the SRP tests:

```bash
cd services/api && go test ./internal/auth/ -v -run SRP
```

The crypto layer beyond SRP includes Argon2id key derivation, AES-256-GCM vault encryption, BIP-39 seed phrases for recovery, and Arweave-based vault archival. All zero-knowledge, all client-side.

---

Maurice | maurice_wen@proton.me
