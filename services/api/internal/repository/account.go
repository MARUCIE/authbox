package repository

import (
	"fmt"
	"sync"
	"time"

	"auth-box-api/internal/models"

	"github.com/google/uuid"
)

// AccountRepository handles account persistence
type AccountRepository struct {
	mu           sync.RWMutex
	accounts     map[uuid.UUID]*models.Account
	platformRepo *PlatformRepository
}

// NewAccountRepository creates a new in-memory account repository
func NewAccountRepository(platformRepo *PlatformRepository) *AccountRepository {
	return &AccountRepository{
		accounts:     make(map[uuid.UUID]*models.Account),
		platformRepo: platformRepo,
	}
}

// Create creates a new account
func (r *AccountRepository) Create(req models.CreateAccountRequest) (*models.Account, error) {
	// Verify platform exists
	_, err := r.platformRepo.GetByID(req.PlatformID)
	if err != nil {
		return nil, fmt.Errorf("platform not found: %w", err)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	account := &models.Account{
		ID:                uuid.New(),
		PlatformID:        req.PlatformID,
		DisplayName:       req.DisplayName,
		ExternalAccountID: fmt.Sprintf("ext_%s", uuid.New().String()[:8]),
		Status:            models.AccountStatusActive,
		RiskScore:         0.0,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	r.accounts[account.ID] = account
	return account, nil
}

// GetByID retrieves an account by ID
func (r *AccountRepository) GetByID(id uuid.UUID) (*models.Account, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	account, exists := r.accounts[id]
	if !exists {
		return nil, ErrNotFound
	}
	return account, nil
}

// List returns all accounts with optional filtering by platform
func (r *AccountRepository) List(platformID *uuid.UUID, limit int, offset int) ([]*models.Account, int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Filter by platform if specified
	filtered := make([]*models.Account, 0)
	for _, a := range r.accounts {
		if platformID != nil && a.PlatformID != *platformID {
			continue
		}
		filtered = append(filtered, a)
	}

	total := len(filtered)

	// Apply pagination
	if offset >= len(filtered) {
		return []*models.Account{}, total, nil
	}

	end := offset + limit
	if end > len(filtered) {
		end = len(filtered)
	}

	return filtered[offset:end], total, nil
}

// Update updates an existing account
func (r *AccountRepository) Update(id uuid.UUID, req models.UpdateAccountRequest) (*models.Account, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	account, exists := r.accounts[id]
	if !exists {
		return nil, ErrNotFound
	}

	if req.DisplayName != nil {
		account.DisplayName = *req.DisplayName
	}
	if req.Status != nil {
		account.Status = *req.Status
	}
	account.UpdatedAt = time.Now().UTC()

	return account, nil
}

// Delete removes an account by ID
func (r *AccountRepository) Delete(id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.accounts[id]; !exists {
		return ErrNotFound
	}

	delete(r.accounts, id)
	return nil
}

// ListByPlatform returns all accounts for a specific platform
func (r *AccountRepository) ListByPlatform(platformID uuid.UUID) ([]*models.Account, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*models.Account, 0)
	for _, a := range r.accounts {
		if a.PlatformID == platformID {
			result = append(result, a)
		}
	}
	return result, nil
}
