package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"math"
	"time"

	"auth-box-api/internal/repository/pg"

	"github.com/google/uuid"
)

type TOTPService struct {
	userRepo *pg.UserRepository
}

func NewTOTPService(userRepo *pg.UserRepository) *TOTPService {
	return &TOTPService{userRepo: userRepo}
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

	if err := s.userRepo.SetTOTPSecret(ctx, userID, secret); err != nil {
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

	if !validateTOTP(user.TOTPSecret, code, time.Now()) {
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

	if !validateTOTP(user.TOTPSecret, code, time.Now()) {
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
	return validateTOTP(user.TOTPSecret, code, time.Now()), nil
}

func validateTOTP(secret []byte, code string, now time.Time) bool {
	// Allow 1 step window (30s before, current, 30s after)
	counter := now.Unix() / 30
	for i := int64(-1); i <= 1; i++ {
		if generateTOTP(secret, counter+i) == code {
			return true
		}
	}
	return false
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
