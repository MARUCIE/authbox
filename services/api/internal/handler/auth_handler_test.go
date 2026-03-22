package handler

import (
	"testing"
	"time"
)

func TestEmailRateLimit_PrunesExpiredEntries(t *testing.T) {
	t.Parallel()

	rl := emailRateLimit{
		maxAttempts: 3,
		entries: map[string]emailEntry{
			"stale-1@authbox.io": {count: 3, start: time.Now().Add(-10 * time.Minute)},
			"stale-2@authbox.io": {count: 2, start: time.Now().Add(-6 * time.Minute)},
			"fresh@authbox.io":   {count: 1, start: time.Now().Add(-1 * time.Minute)},
		},
	}

	if !rl.allow("new@authbox.io") {
		t.Fatal("expected new email to be allowed")
	}

	if _, ok := rl.entries["stale-1@authbox.io"]; ok {
		t.Fatal("expected stale-1 entry to be pruned")
	}
	if _, ok := rl.entries["stale-2@authbox.io"]; ok {
		t.Fatal("expected stale-2 entry to be pruned")
	}
	if _, ok := rl.entries["fresh@authbox.io"]; !ok {
		t.Fatal("expected fresh entry to be retained")
	}
}

func TestEmailRateLimit_UsesConfiguredMaxAttempts(t *testing.T) {
	t.Parallel()

	rl := emailRateLimit{maxAttempts: 5}
	email := "flow@authbox.io"

	for attempt := 1; attempt <= 5; attempt++ {
		if !rl.allow(email) {
			t.Fatalf("expected attempt %d to be allowed", attempt)
		}
	}

	if rl.allow(email) {
		t.Fatal("expected attempt 6 to be rejected")
	}
}
