package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"math/big"
)

// RFC 5054 2048-bit SRP group parameters.
var (
	srpN *big.Int
	srpG *big.Int
	srpK *big.Int
)

func init() {
	// 2048-bit prime from RFC 5054 Appendix A.
	srpN, _ = new(big.Int).SetString(
		"AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050"+
			"A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50"+
			"E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8"+
			"55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B"+
			"CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748"+
			"544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6"+
			"AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6"+
			"94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73", 16)

	srpG = big.NewInt(2)

	// k = H(N | PAD(g))
	srpK = computeK(srpN, srpG)
}

// SRPServer holds the ephemeral state for one login handshake.
type SRPServer struct {
	verifier *big.Int
	b        *big.Int // server secret
	B        *big.Int // server public value
	A        *big.Int // client public value (set in VerifyProof)
	S        *big.Int // shared secret (set in VerifyProof)
}

// NewSRPServer creates a server-side SRP session from the user's verifier.
// Returns the server public value B = k*v + g^b mod N.
func NewSRPServer(verifier []byte) (*SRPServer, error) {
	v := new(big.Int).SetBytes(verifier)
	if v.Sign() == 0 {
		return nil, errors.New("srp: zero verifier")
	}

	b, err := randBigInt(256)
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

	return &SRPServer{
		verifier: v,
		b:        b,
		B:        B,
	}, nil
}

// PublicB returns the server's public value as bytes.
func (s *SRPServer) PublicB() []byte {
	return padTo(s.B, len(srpN.Bytes()))
}

// VerifyProof checks the client's proof M1 and returns the server proof M2.
// clientA is the client's public value A = g^a mod N.
// clientM1 is the client's proof = H(H(N) XOR H(g) | H(email) | salt | A | B | S).
// For simplicity we use M1 = H(A | B | S) and M2 = H(A | M1 | S).
func (s *SRPServer) VerifyProof(clientA, clientM1 []byte) ([]byte, error) {
	A := new(big.Int).SetBytes(clientA)

	// Safety check: A mod N != 0
	if new(big.Int).Mod(A, srpN).Sign() == 0 {
		return nil, errors.New("srp: A mod N is zero")
	}
	s.A = A

	// u = H(A | B)
	u := computeU(A, s.B)
	if u.Sign() == 0 {
		return nil, errors.New("srp: u is zero")
	}

	// S = (A * v^u)^b mod N
	vu := new(big.Int).Exp(s.verifier, u, srpN)
	avu := new(big.Int).Mul(A, vu)
	avu.Mod(avu, srpN)
	S := new(big.Int).Exp(avu, s.b, srpN)
	s.S = S

	nLen := len(srpN.Bytes())
	Apad := padTo(A, nLen)
	Bpad := padTo(s.B, nLen)
	Spad := padTo(S, nLen)

	// K = H(S) — session key derived from shared secret
	K := hashBytes(Spad)

	// Compute expected M1 = H(A | B | K) — must match client's computation
	expectedM1 := hashBytes(Apad, Bpad, K)

	if !constantTimeEqual(expectedM1, clientM1) {
		return nil, errors.New("srp: client proof invalid")
	}

	// M2 = H(A | M1 | K)
	M2 := hashBytes(Apad, clientM1, K)
	return M2, nil
}

// --- Helpers ---

func computeK(N, g *big.Int) *big.Int {
	nLen := len(N.Bytes())
	h := sha256.New()
	h.Write(padTo(N, nLen))
	h.Write(padTo(g, nLen))
	return new(big.Int).SetBytes(h.Sum(nil))
}

func computeU(A, B *big.Int) *big.Int {
	nLen := len(srpN.Bytes())
	h := sha256.New()
	h.Write(padTo(A, nLen))
	h.Write(padTo(B, nLen))
	return new(big.Int).SetBytes(h.Sum(nil))
}

func hashBytes(parts ...[]byte) []byte {
	h := sha256.New()
	for _, p := range parts {
		h.Write(p)
	}
	return h.Sum(nil)
}

func padTo(n *big.Int, length int) []byte {
	b := n.Bytes()
	if len(b) >= length {
		return b
	}
	padded := make([]byte, length)
	copy(padded[length-len(b):], b)
	return padded
}

func randBigInt(bits int) (*big.Int, error) {
	byteLen := bits / 8
	buf := make([]byte, byteLen)
	_, err := rand.Read(buf)
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(buf), nil
}

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
