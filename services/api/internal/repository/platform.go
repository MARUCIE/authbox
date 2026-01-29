package repository

import (
	"errors"
	"sync"
	"time"

	"auth-box-api/internal/models"

	"github.com/google/uuid"
)

var (
	ErrNotFound      = errors.New("resource not found")
	ErrAlreadyExists = errors.New("resource already exists")
)

// PlatformRepository handles platform persistence
type PlatformRepository struct {
	mu        sync.RWMutex
	platforms map[uuid.UUID]*models.Platform
}

// NewPlatformRepository creates a new in-memory platform repository
func NewPlatformRepository() *PlatformRepository {
	return &PlatformRepository{
		platforms: make(map[uuid.UUID]*models.Platform),
	}
}

// Create creates a new platform
func (r *PlatformRepository) Create(req models.CreatePlatformRequest) (*models.Platform, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	platform := &models.Platform{
		ID:        uuid.New(),
		Name:      req.Name,
		Type:      req.Type,
		Status:    models.PlatformStatusActive,
		Config:    req.Config,
		CreatedAt: now,
		UpdatedAt: now,
	}

	r.platforms[platform.ID] = platform
	return platform, nil
}

// GetByID retrieves a platform by ID
func (r *PlatformRepository) GetByID(id uuid.UUID) (*models.Platform, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	platform, exists := r.platforms[id]
	if !exists {
		return nil, ErrNotFound
	}
	return platform, nil
}

// List returns all platforms with optional pagination
func (r *PlatformRepository) List(limit int, offset int) ([]*models.Platform, int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Convert map to slice
	all := make([]*models.Platform, 0, len(r.platforms))
	for _, p := range r.platforms {
		all = append(all, p)
	}

	total := len(all)

	// Apply pagination
	if offset >= len(all) {
		return []*models.Platform{}, total, nil
	}

	end := offset + limit
	if end > len(all) {
		end = len(all)
	}

	return all[offset:end], total, nil
}

// Update updates an existing platform
func (r *PlatformRepository) Update(id uuid.UUID, req models.UpdatePlatformRequest) (*models.Platform, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	platform, exists := r.platforms[id]
	if !exists {
		return nil, ErrNotFound
	}

	if req.Name != nil {
		platform.Name = *req.Name
	}
	if req.Status != nil {
		platform.Status = *req.Status
	}
	if req.Config != nil {
		platform.Config = *req.Config
	}
	platform.UpdatedAt = time.Now().UTC()

	return platform, nil
}

// Delete removes a platform by ID
func (r *PlatformRepository) Delete(id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.platforms[id]; !exists {
		return ErrNotFound
	}

	delete(r.platforms, id)
	return nil
}
