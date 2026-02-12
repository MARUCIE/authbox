package repository

import (
	"fmt"
	"sync"
	"time"

	"auth-box-api/internal/models"

	"github.com/google/uuid"
)

// CredentialRepository handles credential persistence.
type CredentialRepository struct {
	mu          sync.RWMutex
	credentials map[uuid.UUID]*models.Credential
	accountRepo *AccountRepository
}

// NewCredentialRepository creates a new in-memory credential repository.
func NewCredentialRepository(accountRepo *AccountRepository) *CredentialRepository {
	return &CredentialRepository{
		credentials: make(map[uuid.UUID]*models.Credential),
		accountRepo: accountRepo,
	}
}

// Create creates a new credential.
func (r *CredentialRepository) Create(req models.CreateCredentialRequest) (*models.Credential, error) {
	_, err := r.accountRepo.GetByID(req.AccountID)
	if err != nil {
		return nil, fmt.Errorf("account not found: %w", err)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	credential := &models.Credential{
		ID:        uuid.New(),
		AccountID: req.AccountID,
		Type:      req.Type,
		Status:    models.CredentialStatusActive,
		ExpiresAt: req.ExpiresAt,
		CreatedAt: now,
		UpdatedAt: now,
	}

	r.credentials[credential.ID] = credential
	return credential, nil
}

// GetByID retrieves a credential by ID.
func (r *CredentialRepository) GetByID(id uuid.UUID) (*models.Credential, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	credential, exists := r.credentials[id]
	if !exists {
		return nil, ErrNotFound
	}
	return credential, nil
}

// List returns all credentials with optional pagination.
func (r *CredentialRepository) List(limit int, offset int) ([]*models.Credential, int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	all := make([]*models.Credential, 0, len(r.credentials))
	for _, c := range r.credentials {
		all = append(all, c)
	}

	total := len(all)
	if offset >= len(all) {
		return []*models.Credential{}, total, nil
	}

	end := offset + limit
	if end > len(all) {
		end = len(all)
	}

	return all[offset:end], total, nil
}

// Rotate rotates an existing credential.
func (r *CredentialRepository) Rotate(id uuid.UUID) (*models.Credential, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	credential, exists := r.credentials[id]
	if !exists {
		return nil, ErrNotFound
	}

	now := time.Now().UTC()
	credential.RotatedAt = &now
	credential.UpdatedAt = now
	return credential, nil
}

// Delete revokes and removes a credential.
func (r *CredentialRepository) Delete(id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.credentials[id]; !exists {
		return ErrNotFound
	}

	delete(r.credentials, id)
	return nil
}
