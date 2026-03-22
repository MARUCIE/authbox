package pg

import (
	"crypto/sha256"
	"fmt"
	"testing"
	"time"
)

func TestVerifyChainRows_AllowsNonEmptyStartingPrevHashForRecentSegment(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 3, 22, 0, 0, 0, 0, time.UTC)
	rows := []auditChainRow{
		newAuditChainRow("older-segment-hash", "user", "actor-1", "LOGIN", "vault", "item-1", "allow", start),
		newAuditChainRow("", "user", "actor-1", "READ", "vault", "item-1", "allow", start.Add(time.Second)),
		newAuditChainRow("", "user", "actor-1", "ROTATE", "vault", "item-1", "allow", start.Add(2*time.Second)),
	}
	rows[1].PrevEventHash = rows[0].EventHash
	rows[1].EventHash = computeAuditChainHash(rows[1])
	rows[2].PrevEventHash = rows[1].EventHash
	rows[2].EventHash = computeAuditChainHash(rows[2])

	valid, verified := verifyChainRows(rows)
	if !valid {
		t.Fatal("expected recent chain segment to verify successfully")
	}
	if verified != len(rows) {
		t.Fatalf("expected %d rows to be verified, got %d", len(rows), verified)
	}
}

func newAuditChainRow(prevHash, actorType, actorID, action, resourceType, resourceID, decision string, createdAt time.Time) auditChainRow {
	row := auditChainRow{
		ActorType:     actorType,
		ActorID:       actorID,
		Action:        action,
		ResourceType:  resourceType,
		ResourceID:    resourceID,
		Decision:      decision,
		PrevEventHash: prevHash,
		CreatedAt:     createdAt,
	}
	row.EventHash = computeAuditChainHash(row)
	return row
}

func computeAuditChainHash(row auditChainRow) string {
	hashInput := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%s|%s",
		row.PrevEventHash, row.ActorType, row.ActorID, row.Action,
		row.ResourceType, row.ResourceID, row.Decision,
		row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"))
	sum := sha256.Sum256([]byte(hashInput))
	return fmt.Sprintf("%x", sum)
}
