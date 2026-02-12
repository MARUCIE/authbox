package repository

import (
	"fmt"
	"sync"
	"time"

	"auth-box-api/internal/models"

	"github.com/google/uuid"
)

// AssistantRepository handles assistant persistence.
type AssistantRepository struct {
	mu             sync.RWMutex
	assistants     map[uuid.UUID]*models.Assistant
	credentialRepo *CredentialRepository
}

// NewAssistantRepository creates a new in-memory assistant repository.
func NewAssistantRepository(credentialRepo *CredentialRepository) *AssistantRepository {
	return &AssistantRepository{
		assistants:     make(map[uuid.UUID]*models.Assistant),
		credentialRepo: credentialRepo,
	}
}

// Create creates a new assistant.
func (r *AssistantRepository) Create(req models.CreateAssistantRequest) (*models.Assistant, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	assistant := &models.Assistant{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
		Status:      models.AssistantStatusActive,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	r.assistants[assistant.ID] = assistant
	return assistant, nil
}

// GetByID retrieves an assistant by ID.
func (r *AssistantRepository) GetByID(id uuid.UUID) (*models.Assistant, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	assistant, exists := r.assistants[id]
	if !exists {
		return nil, ErrNotFound
	}
	return assistant, nil
}

// List returns all assistants with optional pagination.
func (r *AssistantRepository) List(limit int, offset int) ([]*models.Assistant, int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	all := make([]*models.Assistant, 0, len(r.assistants))
	for _, a := range r.assistants {
		all = append(all, a)
	}

	total := len(all)
	if offset >= len(all) {
		return []*models.Assistant{}, total, nil
	}

	end := offset + limit
	if end > len(all) {
		end = len(all)
	}

	return all[offset:end], total, nil
}

// Bind binds an assistant to a credential.
func (r *AssistantRepository) Bind(id uuid.UUID, req models.BindAssistantRequest) (*models.Assistant, error) {
	_, err := r.credentialRepo.GetByID(req.CredentialID)
	if err != nil {
		return nil, fmt.Errorf("credential not found: %w", err)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	assistant, exists := r.assistants[id]
	if !exists {
		return nil, ErrNotFound
	}

	now := time.Now().UTC()
	assistant.CredentialID = &req.CredentialID
	assistant.Scope = req.Scope
	assistant.UpdatedAt = now
	return assistant, nil
}
