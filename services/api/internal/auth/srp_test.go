package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"math/big"
	"testing"
)

// computeClientSide simulates the client-side SRP computation (mirrors srp.ts).
// Returns clientA, clientM1, sessionKey.
func computeClientSide(t *testing.T, email, password string, salt, serverB []byte) ([]byte, []byte, []byte) {
	t.Helper()

	nLen := len(srpN.Bytes())

	// Generate client ephemeral: a, A = g^a mod N
	a, err := randBigInt(256)
	if err != nil {
		t.Fatalf("randBigInt: %v", err)
	}
	A := new(big.Int).Exp(srpG, a, srpN)
	if A.Sign() == 0 {
		t.Fatal("A is zero")
	}

	B := new(big.Int).SetBytes(serverB)
	if new(big.Int).Mod(B, srpN).Sign() == 0 {
		t.Fatal("B mod N is zero")
	}

	// u = H(PAD(A) || PAD(B))
	u := computeU(A, B)
	if u.Sign() == 0 {
		t.Fatal("u is zero")
	}

	// x = H(salt || H(email:password))
	innerH := sha256.Sum256([]byte(email + ":" + password))
	h2 := sha256.New()
	h2.Write(salt)
	h2.Write(innerH[:])
	x := new(big.Int).SetBytes(h2.Sum(nil))

	// S = (B - k * g^x) ^ (a + u*x) mod N
	gx := new(big.Int).Exp(srpG, x, srpN)
	kgx := new(big.Int).Mul(srpK, gx)
	kgx.Mod(kgx, srpN)
	base := new(big.Int).Sub(B, kgx)
	base.Mod(base, srpN)
	if base.Sign() < 0 {
		base.Add(base, srpN)
	}
	exp := new(big.Int).Mul(u, x)
	exp.Add(exp, a)
	S := new(big.Int).Exp(base, exp, srpN)

	Spad := padTo(S, nLen)
	K := hashBytes(Spad) // K = H(S) — session key

	// M1 = H(PAD(A) || PAD(B) || K)
	Apad := padTo(A, nLen)
	Bpad := padTo(B, nLen)
	M1 := hashBytes(Apad, Bpad, K)

	return Apad, M1, K
}

func TestSRPHandshakeRoundTrip(t *testing.T) {
	email := "test@authbox.io"
	password := "SuperSecure!123"

	// 1. Registration: compute verifier
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}

	innerH := sha256.Sum256([]byte(email + ":" + password))
	h2 := sha256.New()
	h2.Write(salt)
	h2.Write(innerH[:])
	x := new(big.Int).SetBytes(h2.Sum(nil))
	verifier := new(big.Int).Exp(srpG, x, srpN)
	verifierBytes := padTo(verifier, len(srpN.Bytes()))

	// 2. Server init: create SRP server session
	srv, err := NewSRPServer(verifierBytes)
	if err != nil {
		t.Fatalf("NewSRPServer: %v", err)
	}
	serverB := srv.PublicB()

	// 3. Client computes proof
	clientA, clientM1, clientK := computeClientSide(t, email, password, salt, serverB)

	// 4. Server verifies proof — this is the critical test
	m2, err := srv.VerifyProof(clientA, clientM1)
	if err != nil {
		t.Fatalf("VerifyProof failed: %v", err)
	}
	if m2 == nil {
		t.Fatal("M2 is nil")
	}

	// 5. Verify M2 on client side: M2 = H(A | M1 | K)
	expectedM2 := hashBytes(clientA, clientM1, clientK)
	if !constantTimeEqual(m2, expectedM2) {
		t.Fatal("M2 verification failed: mutual authentication broken")
	}
}

func TestSRPRejectsWrongPassword(t *testing.T) {
	email := "test@authbox.io"
	correctPassword := "CorrectPassword!1"
	wrongPassword := "WrongPassword!2"

	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}

	// Register with correct password
	innerH := sha256.Sum256([]byte(email + ":" + correctPassword))
	h2 := sha256.New()
	h2.Write(salt)
	h2.Write(innerH[:])
	x := new(big.Int).SetBytes(h2.Sum(nil))
	verifier := new(big.Int).Exp(srpG, x, srpN)
	verifierBytes := padTo(verifier, len(srpN.Bytes()))

	srv, err := NewSRPServer(verifierBytes)
	if err != nil {
		t.Fatalf("NewSRPServer: %v", err)
	}

	// Try to login with wrong password
	clientA, clientM1, _ := computeClientSide(t, email, wrongPassword, salt, srv.PublicB())

	_, err = srv.VerifyProof(clientA, clientM1)
	if err == nil {
		t.Fatal("VerifyProof should have failed with wrong password")
	}
}

func TestSRPRejectsZeroA(t *testing.T) {
	salt := make([]byte, 32)
	rand.Read(salt)

	verifier := make([]byte, 256)
	verifier[255] = 1 // non-zero verifier
	srv, err := NewSRPServer(verifier)
	if err != nil {
		t.Fatalf("NewSRPServer: %v", err)
	}

	// A = 0 should be rejected
	zeroA := make([]byte, 256)
	fakeM1 := make([]byte, 32)
	_, err = srv.VerifyProof(zeroA, fakeM1)
	if err == nil {
		t.Fatal("VerifyProof should reject A = 0")
	}
}

func TestSRPRejectsZeroVerifier(t *testing.T) {
	zeroVerifier := make([]byte, 256)
	_, err := NewSRPServer(zeroVerifier)
	if err == nil {
		t.Fatal("NewSRPServer should reject zero verifier")
	}
}

func TestComputeK(t *testing.T) {
	// k = H(N || PAD(g)) should be deterministic
	k1 := computeK(srpN, srpG)
	k2 := computeK(srpN, srpG)
	if k1.Cmp(k2) != 0 {
		t.Fatal("k should be deterministic")
	}
	if k1.Sign() == 0 {
		t.Fatal("k should not be zero")
	}
}

func TestConstantTimeEqual(t *testing.T) {
	a := []byte{1, 2, 3, 4}
	b := []byte{1, 2, 3, 4}
	c := []byte{1, 2, 3, 5}
	d := []byte{1, 2, 3}

	if !constantTimeEqual(a, b) {
		t.Fatal("equal slices should match")
	}
	if constantTimeEqual(a, c) {
		t.Fatal("different slices should not match")
	}
	if constantTimeEqual(a, d) {
		t.Fatal("different length slices should not match")
	}
}
