package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

type TOTPService struct {
	userRepo     domain.UserRepository
	secretCipher cipher.AEAD

	// usedSteps records, per user, the newest time step a code was accepted
	// for. RFC 6238 §5.2: a verifier must not accept the same OTP twice, so a
	// code that was shoulder-surfed, phished or logged cannot be replayed
	// inside its ~90s validity window. In-process state: correct for the
	// single API instance this service runs as; a multi-replica deployment
	// would need this in the database or Redis.
	mu        sync.Mutex
	usedSteps map[uuid.UUID]int64
}

func NewTOTPService(userRepo domain.UserRepository, secretKey []byte) *TOTPService {
	block, err := aes.NewCipher(secretKey)
	if err != nil {
		panic("invalid TOTP secret encryption key")
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		panic("invalid TOTP secret encryption cipher")
	}
	return &TOTPService{userRepo: userRepo, secretCipher: aead, usedSteps: make(map[uuid.UUID]int64)}
}

type TOTPEnrollResponse struct {
	Secret string `json:"secret"`
	URI    string `json:"uri"`
}

// IsEnabled returns whether TOTP is enabled for the user.
func (s *TOTPService) IsEnabled(ctx context.Context, userID uuid.UUID) (bool, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return false, err
	}
	if user == nil {
		return false, nil
	}
	return user.TOTPEnabled, nil
}

// Enroll generates a new TOTP secret and stores it (not yet enabled).
func (s *TOTPService) Enroll(ctx context.Context, userID uuid.UUID) (*TOTPEnrollResponse, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}
	if user.TOTPEnabled {
		return nil, fmt.Errorf("TOTP already enabled")
	}

	// Generate 20-byte secret
	secret := make([]byte, 20)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}

	encryptedSecret, err := s.encryptSecret(secret)
	if err != nil {
		return nil, err
	}

	if err := s.userRepo.SetTOTPSecret(ctx, userID, encryptedSecret); err != nil {
		return nil, err
	}

	b32Secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secret)
	uri := fmt.Sprintf("otpauth://totp/AuthBox:%s?secret=%s&issuer=AuthBox&algorithm=SHA1&digits=6&period=30", user.Email, b32Secret)

	return &TOTPEnrollResponse{Secret: b32Secret, URI: uri}, nil
}

// Verify checks a TOTP code and enables TOTP if valid.
func (s *TOTPService) Verify(ctx context.Context, userID uuid.UUID, code string) error {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}
	if user.TOTPSecret == nil {
		return fmt.Errorf("TOTP not enrolled")
	}

	secret, err := s.decryptSecret(user.TOTPSecret)
	if err != nil {
		return err
	}

	if !s.acceptCode(userID, secret, code, time.Now()) {
		return fmt.Errorf("invalid TOTP code")
	}

	return s.userRepo.EnableTOTP(ctx, userID)
}

// Disable disables TOTP after verifying the current code.
func (s *TOTPService) Disable(ctx context.Context, userID uuid.UUID, code string) error {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}
	if !user.TOTPEnabled {
		return fmt.Errorf("TOTP not enabled")
	}

	secret, err := s.decryptSecret(user.TOTPSecret)
	if err != nil {
		return err
	}

	if !s.acceptCode(userID, secret, code, time.Now()) {
		return fmt.Errorf("invalid TOTP code")
	}

	return s.userRepo.DisableTOTP(ctx, userID)
}

// Check validates a TOTP code (used during login if TOTP is enabled).
func (s *TOTPService) Check(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return false, err
	}
	if user == nil || !user.TOTPEnabled {
		return false, nil
	}
	secret, err := s.decryptSecret(user.TOTPSecret)
	if err != nil {
		return false, err
	}
	return s.acceptCode(userID, secret, code, time.Now()), nil
}

// acceptCode validates code and, if it matches, consumes its time step so the
// same code (or an older one) is rejected on any later call for this user.
func (s *TOTPService) acceptCode(userID uuid.UUID, secret []byte, code string, now time.Time) bool {
	step, ok := matchTOTPStep(secret, code, now)
	if !ok {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if last, seen := s.usedSteps[userID]; seen && step <= last {
		return false
	}
	s.usedSteps[userID] = step
	if len(s.usedSteps) > 4096 {
		// Entries older than the validity window can never block a code again.
		horizon := now.Unix()/30 - 2
		for id, last := range s.usedSteps {
			if last < horizon {
				delete(s.usedSteps, id)
			}
		}
	}
	return true
}

const totpSecretEnvelopePrefix = "authbox-totp-v1:"
const totpSecretAAD = "authbox:totp:v1"

func (s *TOTPService) encryptSecret(secret []byte) ([]byte, error) {
	nonce := make([]byte, s.secretCipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	ciphertext := s.secretCipher.Seal(nil, nonce, secret, []byte(totpSecretAAD))
	envelope := totpSecretEnvelopePrefix +
		base64.RawStdEncoding.EncodeToString(nonce) +
		":" +
		base64.RawStdEncoding.EncodeToString(ciphertext)
	return []byte(envelope), nil
}

func (s *TOTPService) decryptSecret(envelope []byte) ([]byte, error) {
	text := string(envelope)
	if !strings.HasPrefix(text, totpSecretEnvelopePrefix) {
		return nil, fmt.Errorf("TOTP secret is not encrypted")
	}

	parts := strings.Split(strings.TrimPrefix(text, totpSecretEnvelopePrefix), ":")
	if len(parts) != 2 {
		return nil, fmt.Errorf("TOTP secret envelope is malformed")
	}

	nonce, err := base64.RawStdEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("TOTP secret nonce is malformed")
	}
	ciphertext, err := base64.RawStdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("TOTP secret ciphertext is malformed")
	}

	secret, err := s.secretCipher.Open(nil, nonce, ciphertext, []byte(totpSecretAAD))
	if err != nil {
		return nil, fmt.Errorf("TOTP secret decrypt failed")
	}
	return secret, nil
}

// matchTOTPStep checks code against the current step and one step either side
// (clock skew) and returns the step it matched. Every candidate is compared in
// constant time so timing does not reveal which step, if any, matched.
func matchTOTPStep(secret []byte, code string, now time.Time) (int64, bool) {
	counter := now.Unix() / 30
	var matched int64
	found := 0
	for i := int64(-1); i <= 1; i++ {
		eq := subtle.ConstantTimeCompare([]byte(generateTOTP(secret, counter+i)), []byte(code))
		if eq == 1 {
			matched = counter + i
		}
		found |= eq
	}
	return matched, found == 1
}

func generateTOTP(secret []byte, counter int64) string {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))

	mac := hmac.New(sha1.New, secret)
	mac.Write(buf)
	hash := mac.Sum(nil)

	offset := hash[len(hash)-1] & 0x0F
	truncated := binary.BigEndian.Uint32(hash[offset:offset+4]) & 0x7FFFFFFF
	otp := truncated % uint32(math.Pow10(6))

	return fmt.Sprintf("%06d", otp)
}
