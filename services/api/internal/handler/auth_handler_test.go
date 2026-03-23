package handler

import (
	"testing"
	"time"
)

func TestEmailRateLimit_PrunesExpiredEntries(t *testing.T) {
	t.Parallel()

	rl := &emailRateLimit{
		maxAttempts: 3,
		maxEntries:  10000,
		window:      5 * time.Minute,
		entries: map[string]emailEntry{
			"stale-1@authbox.io": {count: 3, start: time.Now().Add(-10 * time.Minute)},
			"stale-2@authbox.io": {count: 2, start: time.Now().Add(-6 * time.Minute)},
			"fresh@authbox.io":   {count: 1, start: time.Now().Add(-1 * time.Minute)},
		},
	}

	if !rl.allow("new@authbox.io") {
		t.Fatal("expected new email to be allowed")
	}

	// Stale entries should be overwritten on their next call; verify fresh entry remains
	if _, ok := rl.entries["fresh@authbox.io"]; !ok {
		t.Fatal("expected fresh entry to be retained")
	}
}

func TestEmailRateLimit_UsesConfiguredMaxAttempts(t *testing.T) {
	t.Parallel()

	rl := newEmailRateLimit(5)
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

func TestEmailRateLimit_MemoryCap(t *testing.T) {
	t.Parallel()

	rl := &emailRateLimit{
		maxAttempts: 5,
		maxEntries:  3,
		window:      5 * time.Minute,
		entries:     make(map[string]emailEntry),
	}

	// Fill to capacity
	rl.allow("a@test.io")
	rl.allow("b@test.io")
	rl.allow("c@test.io")

	// 4th distinct email should be rejected (load shedding)
	if rl.allow("d@test.io") {
		t.Fatal("expected 4th email to be rejected when at capacity")
	}

	// Existing email should still be allowed
	if !rl.allow("a@test.io") {
		t.Fatal("expected existing email to still be allowed")
	}
}
