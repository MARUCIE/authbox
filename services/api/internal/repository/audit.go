package repository

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"auth-box-api/internal/models"

	"github.com/google/uuid"
)

// AuditRepository handles audit events and export jobs.
type AuditRepository struct {
	mu       sync.RWMutex
	events   []*models.AuditEvent
	exports  map[uuid.UUID]*models.AuditExport
	lastHash string
}

// NewAuditRepository creates a new in-memory audit repository.
func NewAuditRepository() *AuditRepository {
	return &AuditRepository{
		events:  make([]*models.AuditEvent, 0),
		exports: make(map[uuid.UUID]*models.AuditExport),
	}
}

// RecordAuditEventInput defines payload for append-only audit events.
type RecordAuditEventInput struct {
	ActorID  string
	Source   string
	Action   string
	Resource string
	Decision models.AuditDecision
	Result   string
	Reason   string
	Input    any
	Output   any
}

// Record appends an immutable audit event with hash-chain linkage.
func (r *AuditRepository) Record(input RecordAuditEventInput) *models.AuditEvent {
	r.mu.Lock()
	defer r.mu.Unlock()

	event := &models.AuditEvent{
		ID:            uuid.New(),
		Timestamp:     time.Now().UTC(),
		ActorID:       input.ActorID,
		Source:        input.Source,
		Action:        input.Action,
		Resource:      input.Resource,
		Decision:      input.Decision,
		Result:        input.Result,
		Reason:        input.Reason,
		InputsHash:    payloadHash(input.Input),
		OutputsHash:   payloadHash(input.Output),
		PrevEventHash: r.lastHash,
	}

	event.EventHash = chainHash(event)
	r.lastHash = event.EventHash
	r.events = append(r.events, event)
	return event
}

// List returns all audit events with optional pagination.
func (r *AuditRepository) List(limit int, offset int) ([]*models.AuditEvent, int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	total := len(r.events)
	if offset >= total {
		return []*models.AuditEvent{}, total, nil
	}

	end := offset + limit
	if end > total {
		end = total
	}

	items := make([]*models.AuditEvent, end-offset)
	copy(items, r.events[offset:end])
	return items, total, nil
}

// CreateExport creates a new audit export request.
func (r *AuditRepository) CreateExport(req models.CreateAuditExportRequest) (*models.AuditExport, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	export := &models.AuditExport{
		ID:          uuid.New(),
		Status:      models.AuditExportStatusQueued,
		From:        req.From,
		To:          req.To,
		Format:      req.Format,
		DownloadURL: "",
		CreatedAt:   now,
	}

	r.exports[export.ID] = export

	return export, nil
}

// GetExport retrieves an audit export by ID.
func (r *AuditRepository) GetExport(id uuid.UUID) (*models.AuditExport, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	export, exists := r.exports[id]
	if !exists {
		return nil, ErrNotFound
	}
	return export, nil
}

func payloadHash(payload any) string {
	if payload == nil {
		return ""
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func chainHash(event *models.AuditEvent) string {
	record := fmt.Sprintf(
		"%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s",
		event.PrevEventHash,
		event.ID.String(),
		event.Timestamp.UTC().Format(time.RFC3339Nano),
		event.ActorID,
		event.Source,
		event.Action,
		event.Resource,
		event.Decision,
		event.Result,
		event.Reason,
		event.InputsHash,
		event.OutputsHash,
	)
	sum := sha256.Sum256([]byte(record))
	return hex.EncodeToString(sum[:])
}
