package migrations

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

var volatilePartialIndexPattern = regexp.MustCompile(`(?is)CREATE\s+(?:UNIQUE\s+)?INDEX\b[^;]*\bWHERE\b[^;]*\b(NOW|CURRENT_TIMESTAMP|CLOCK_TIMESTAMP|STATEMENT_TIMESTAMP|TRANSACTION_TIMESTAMP)\s*\(`)

func TestPartialIndexesDoNotUseVolatileTimeFunctions(t *testing.T) {
	files, err := filepath.Glob("*.up.sql")
	if err != nil {
		t.Fatalf("glob migrations: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("expected migration files")
	}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}

		if match := volatilePartialIndexPattern.FindString(string(content)); match != "" {
			t.Fatalf("%s contains a partial index predicate with a volatile time function: %s", file, strings.TrimSpace(match))
		}
	}
}
