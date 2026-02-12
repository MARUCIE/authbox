package repository

import (
	"testing"

	"auth-box-api/internal/models"
)

func TestRecordBuildsHashChain(t *testing.T) {
	repo := NewAuditRepository()

	first := repo.Record(RecordAuditEventInput{
		ActorID:  "actor-a",
		Source:   "api",
		Action:   "CREDENTIAL_CREATED",
		Resource: "resource-1",
		Decision: models.AuditDecisionAllow,
		Result:   "success",
		Input:    map[string]any{"step": 1},
		Output:   map[string]any{"status": "ok"},
	})
	second := repo.Record(RecordAuditEventInput{
		ActorID:  "actor-a",
		Source:   "api",
		Action:   "CREDENTIAL_ROTATED",
		Resource: "resource-1",
		Decision: models.AuditDecisionAllow,
		Result:   "success",
		Input:    map[string]any{"step": 2},
		Output:   map[string]any{"status": "ok"},
	})

	if first.EventHash == "" {
		t.Fatalf("first event hash should not be empty")
	}
	if first.PrevEventHash != "" {
		t.Fatalf("first event prev hash should be empty, got %q", first.PrevEventHash)
	}
	if second.PrevEventHash != first.EventHash {
		t.Fatalf("second event prev hash should link to first event hash")
	}
	if second.EventHash == "" {
		t.Fatalf("second event hash should not be empty")
	}
	if second.InputsHash == "" || second.OutputsHash == "" {
		t.Fatalf("input/output hashes should be generated")
	}
	if second.EventHash == first.EventHash {
		t.Fatalf("event hashes should differ across events")
	}
}
