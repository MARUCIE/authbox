package pg

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

var chainUser = uuid.MustParse("11111111-2222-3333-4444-555555555555")

func chain(rows ...auditChainRow) []auditChainRow {
	prev := rows[0].PrevEventHash
	for i := range rows {
		rows[i].PrevEventHash = prev
		rows[i].EventHash = auditEventHash(chainUser, rows[i])
		prev = rows[i].EventHash
	}
	return rows
}

func row(action, resourceType, resourceID string, at time.Time) auditChainRow {
	return auditChainRow{ActorType: "user", ActorID: chainUser.String(), Action: action,
		ResourceType: resourceType, ResourceID: resourceID, Decision: "allowed", CreatedAt: at}
}

func TestVerifyChainRows_AllowsNonEmptyStartingPrevHashForRecentSegment(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 3, 22, 0, 0, 0, 0, time.UTC)
	first := row("login", "vault", "item-1", start)
	first.PrevEventHash = "older-segment-hash"
	rows := chain(first, row("read", "vault", "item-1", start.Add(time.Second)), row("rotate", "vault", "item-1", start.Add(2*time.Second)))

	valid, verified := verifyChainRows(chainUser, rows)
	if !valid || verified != len(rows) {
		t.Fatalf("valid=%v verified=%d, want true/%d", valid, verified, len(rows))
	}
}

func TestVerifyChainRows_DetectsTampering(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 3, 22, 0, 0, 0, 123456000, time.UTC)
	rows := chain(row("agent.create", "agent", "a", start), row("agent.delete", "agent", "a", start.Add(time.Microsecond)))
	rows[0].Decision = "denied"
	if valid, verified := verifyChainRows(chainUser, rows); valid || verified != 0 {
		t.Fatalf("tampered first row: valid=%v verified=%d", valid, verified)
	}

	rows = chain(row("agent.create", "agent", "a", start), row("agent.delete", "agent", "a", start.Add(time.Microsecond)))
	rows[1].CreatedAt = rows[1].CreatedAt.Add(time.Microsecond)
	if valid, _ := verifyChainRows(chainUser, rows); valid {
		t.Fatal("a moved timestamp must not verify")
	}

	if valid, _ := verifyChainRows(uuid.New(), chain(row("x", "", "", start))); valid {
		t.Fatal("a row hashed for one user must not verify for another")
	}
}

func TestAuditEventHash_FieldBoundariesAreUnambiguous(t *testing.T) {
	t.Parallel()

	at := time.Date(2026, 3, 22, 0, 0, 0, 0, time.UTC)
	a := row("delete", "vault", "x|allowed", at)
	b := row("delete", "vault|x", "allowed", at)
	if auditEventHash(chainUser, a) == auditEventHash(chainUser, b) {
		t.Fatal("moving a separator between fields produced the same hash")
	}
}
