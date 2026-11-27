// Package archtest holds executable architecture rules for services/api.
// It has no production code; `go test ./...` runs it with everything else.
//
// The rules (ADR-005, ADR-007):
//   - Layer direction: each internal package may import only the internal
//     packages listed in allowedImports. cmd/api is the composition root and
//     may import anything.
//   - Response encoding: only internal/httpx writes JSON responses. No other
//     non-test file may call json.NewEncoder or http.Error, and handler and
//     middleware may not fmt.Fprint* to a writer.
package archtest

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const module = "auth-box-api/"

// allowedImports maps a package (path relative to the module root) to the
// internal packages it may import. A package missing from this table fails
// the test, so adding a package forces a decision about where it sits.
var allowedImports = map[string][]string{
	"internal/domain":        {},
	"internal/httpx":         {},
	"internal/config":        {},
	"internal/auth":          {"internal/httpx"},
	"internal/middleware":    {"internal/httpx"},
	"internal/repository/pg": {"internal/domain"},
	"internal/service":       {"internal/auth", "internal/domain"},
	"internal/handler": {
		"internal/auth", "internal/config", "internal/domain",
		"internal/httpx", "internal/middleware", "internal/service",
	},
	"migrations": {},
}

// compositionRoots may import any internal package.
var compositionRoots = map[string]bool{"cmd/api": true}

type sourceFile struct {
	pkg  string // directory relative to the module root, slash-separated
	name string
	file *ast.File
}

func moduleRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("go.mod not found")
		}
		dir = parent
	}
}

func loadSources(t *testing.T) []sourceFile {
	t.Helper()
	root := moduleRoot(t)
	fset := token.NewFileSet()
	var out []sourceFile
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if name := d.Name(); name == "vendor" || name == "testdata" || strings.HasPrefix(name, ".") && path != root {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		full, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, filepath.Dir(path))
		out = append(out, sourceFile{pkg: filepath.ToSlash(rel), name: filepath.Base(path), file: full})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) == 0 {
		t.Fatal("no Go sources found")
	}
	return out
}

// importViolations returns one message per forbidden internal import.
func importViolations(files []sourceFile) []string {
	var v []string
	for _, sf := range files {
		if compositionRoots[sf.pkg] {
			continue
		}
		allowed, known := allowedImports[sf.pkg]
		if !known {
			v = append(v, sf.pkg+": package has no entry in allowedImports")
			continue
		}
		for _, imp := range sf.file.Imports {
			path, _ := strconv.Unquote(imp.Path.Value)
			if !strings.HasPrefix(path, module) {
				continue
			}
			dep := strings.TrimPrefix(path, module)
			ok := false
			for _, a := range allowed {
				if dep == a {
					ok = true
					break
				}
			}
			if !ok {
				v = append(v, sf.pkg+"/"+sf.name+" imports "+dep)
			}
		}
	}
	return dedupe(v)
}

// responseViolations returns one message per response written outside httpx.
func responseViolations(files []sourceFile) []string {
	var v []string
	for _, sf := range files {
		if sf.pkg == "internal/httpx" {
			continue
		}
		httpLayer := sf.pkg == "internal/handler" || sf.pkg == "internal/middleware"
		ast.Inspect(sf.file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			x, ok := sel.X.(*ast.Ident)
			if !ok {
				return true
			}
			name := x.Name + "." + sel.Sel.Name
			switch {
			case name == "json.NewEncoder", name == "http.Error":
				v = append(v, sf.pkg+"/"+sf.name+" calls "+name+" (use httpx.WriteJSON/WriteError)")
			case httpLayer && x.Name == "fmt" && strings.HasPrefix(sel.Sel.Name, "Fprint"):
				v = append(v, sf.pkg+"/"+sf.name+" calls "+name+" (use httpx.WriteJSON/WriteError)")
			}
			return true
		})
	}
	return dedupe(v)
}

func dedupe(in []string) []string {
	sort.Strings(in)
	out := in[:0]
	for i, s := range in {
		if i == 0 || s != in[i-1] {
			out = append(out, s)
		}
	}
	return out
}

func TestLayerDirection(t *testing.T) {
	for _, msg := range importViolations(loadSources(t)) {
		t.Error(msg)
	}
}

func TestOnlyHttpxWritesResponses(t *testing.T) {
	for _, msg := range responseViolations(loadSources(t)) {
		t.Error(msg)
	}
}

// The checks above must be able to fail: run them on violating sources.
func TestRulesFireOnViolations(t *testing.T) {
	src := `package x
import (
	"encoding/json"
	"fmt"
	"net/http"
	"auth-box-api/internal/repository/pg"
	"auth-box-api/internal/handler"
)
func f(w http.ResponseWriter) {
	json.NewEncoder(w).Encode(1)
	http.Error(w, "x", 500)
	fmt.Fprintf(w, "x")
	_ = pg.X
	_ = handler.X
}`
	f, err := parser.ParseFile(token.NewFileSet(), "x.go", src, 0)
	if err != nil {
		t.Fatal(err)
	}
	imports := importViolations([]sourceFile{{pkg: "internal/service", name: "x.go", file: f}})
	if len(imports) != 2 {
		t.Errorf("want 2 import violations, got %v", imports)
	}
	unknown := importViolations([]sourceFile{{pkg: "internal/newpkg", name: "x.go", file: f}})
	if len(unknown) != 1 {
		t.Errorf("want unknown-package violation, got %v", unknown)
	}
	resp := responseViolations([]sourceFile{{pkg: "internal/handler", name: "x.go", file: f}})
	if len(resp) != 3 {
		t.Errorf("want 3 response violations, got %v", resp)
	}
	if got := responseViolations([]sourceFile{{pkg: "internal/httpx", name: "x.go", file: f}}); len(got) != 0 {
		t.Errorf("httpx is exempt, got %v", got)
	}
}
