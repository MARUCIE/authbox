#!/usr/bin/env node
// Architecture rules for the TypeScript workspace (ADR-004, ADR-006, ADR-007).
// Each rule names its owner so a failure says where the code belongs.
//
//   node scripts/check-architecture.mjs              check the working tree
//   node scripts/check-architecture.mjs --self-test  prove every rule can fire
//
// Exit 0 when clean, 1 on violations. The Go-side rules live in
// services/api/internal/archtest and run with `go test ./...`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Workspace members the rules cover. apps/console has its own lockfile and is
// outside the pnpm workspace (pending decision P-02), so it is not checked.
// Packages are every packages/<name>/package.json in the tree.
const APPS = ["apps/web", "apps/extension"];
const APP_NAMES = new Set(["@authbox/web", "@authbox/extension"]);
const PACKAGE_MANIFEST_RE = /^packages\/[^/]+\/package\.json$/;

// The one place that owns base64/hex codecs.
const CODEC_OWNER = "packages/crypto/src/encoding.ts";
// The only files that may know the Go API's base URL or its /api/v1 paths.
const API_BASE_OWNERS = new Set([
  "apps/web/lib/api.ts",
  "apps/extension/src/lib/api.ts",
  "apps/extension/src/lib/config.ts",
]);
const API_CLIENT_SRC = "packages/api-client/src/";

const SOURCE_RE = /\.(ts|tsx|mts|mjs|js|jsx)$/;
const TEST_RE = /(\.test\.|\.spec\.|\/__tests__\/)/;
const IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function ownerOf(file, packages) {
  return [...APPS, ...packages].find((d) => file === d || file.startsWith(d + "/"));
}

function loadExports(pkgDir, read) {
  const pkg = JSON.parse(read(path.join(pkgDir, "package.json")));
  return { name: pkg.name, exports: Object.keys(pkg.exports ?? { ".": null }) };
}

function subpathAllowed(subpath, exportKeys) {
  return exportKeys.some((k) => {
    if (!k.includes("*")) return k === subpath;
    const [pre, post] = k.split("*");
    return subpath.startsWith(pre) && subpath.endsWith(post);
  });
}

/**
 * Pure rule engine over a list of files.
 * @param {string[]} files repo-relative, slash-separated
 * @param {(rel: string) => string} read
 */
export function check(files, read) {
  const violations = [];
  const flag = (file, rule, msg) => violations.push(`${file}: [${rule}] ${msg}`);

  const packages = files.filter((f) => PACKAGE_MANIFEST_RE.test(f)).map((f) => path.posix.dirname(f));
  const pkgByName = new Map();
  for (const dir of packages) {
    const { name, exports } = loadExports(dir, read);
    pkgByName.set(name, { dir, exports });
  }

  for (const file of files) {
    const owner = ownerOf(file, packages);
    if (!owner) continue;
    const isPackage = owner.startsWith("packages/");

    // R4: build output never lives beside sources.
    if (isPackage && file.startsWith(owner + "/src/") && /\.(js|js\.map|d\.ts)$/.test(file)) {
      flag(file, "build-output-in-src", "compiled output belongs in dist/");
    }

    // R5: apps and packages resolve workspace packages through their exports.
    if (/(^|\/)tsconfig[^/]*\.json$/.test(file)) {
      const text = read(file);
      if (/"paths"\s*:[\s\S]*?packages\/[^"]*\/src/.test(text)) {
        flag(file, "tsconfig-paths-into-src", "remove the path alias; depend on the package's exports");
      }
      continue;
    }

    if (!SOURCE_RE.test(file)) continue;
    const text = read(file);
    const isTest = TEST_RE.test(file);

    // R1–R3: import direction and package boundaries.
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec.startsWith(".")) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
        const targetOwner = ownerOf(target, packages);
        if (!targetOwner || targetOwner === owner) continue;
        if (targetOwner.startsWith("apps/")) {
          flag(file, isPackage ? "package-imports-app" : "app-imports-app", `imports ${spec}`);
        } else {
          flag(file, "deep-relative-import", `imports ${spec}; use the package name`);
        }
        continue;
      }
      if (APP_NAMES.has(spec.split("/").slice(0, 2).join("/"))) {
        flag(file, isPackage ? "package-imports-app" : "app-imports-app", `imports ${spec}`);
        continue;
      }
      const parts = spec.split("/");
      const name = parts.slice(0, 2).join("/");
      const pkg = pkgByName.get(name);
      if (!pkg) continue;
      const subpath = parts.length > 2 ? "./" + parts.slice(2).join("/") : ".";
      if (!subpathAllowed(subpath, pkg.exports)) {
        flag(file, "import-outside-exports", `imports ${spec}; ${name} exports ${pkg.exports.join(", ")}`);
      }
    }

    if (isTest) continue;

    // R6: one base64/hex codec.
    if (file !== CODEC_OWNER) {
      if (/\b(btoa|atob)\s*\(/.test(text) ||
          /\b(function|const|let)\s+(to|from)(Base64|Hex|B64)\b/.test(text)) {
        flag(file, "local-codec", `use toBase64/fromBase64/toHex/fromHex from @authbox/crypto (${CODEC_OWNER})`);
      }
    }

    // R7: one client for the Go API.
    if (!file.startsWith(API_CLIENT_SRC) && !API_BASE_OWNERS.has(file)) {
      if (/(['"`]|\})\/api\/v1\//.test(text) ||
          /\b(getApiBase|API_BASE|NEXT_PUBLIC_API_BASE_URL|VITE_API_BASE)\b/.test(text)) {
        flag(file, "api-call-outside-client", "call the Go API through @authbox/api-client");
      }
    }
  }
  return violations;
}

function listFiles() {
  const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function selfTest() {
  const fixture = {
    "packages/api-client/package.json": JSON.stringify({ name: "@authbox/api-client", exports: { ".": {}, "./login": {} } }),
    "packages/crypto/package.json": JSON.stringify({ name: "@authbox/crypto", exports: { ".": {} } }),
    "packages/mcp-protocol/package.json": JSON.stringify({ name: "@authbox/mcp-protocol", exports: { ".": {} } }),
    "packages/shared/package.json": JSON.stringify({ name: "@authbox/shared", exports: { ".": {}, "./types/*": {} } }),
    "packages/crypto/src/leftover.js": "",
    "apps/web/tsconfig.json": '{"compilerOptions":{"paths":{"@authbox/crypto":["../../packages/crypto/src"]}}}',
    "apps/web/lib/a.ts": [
      'import { x } from "../../extension/src/lib/b";',
      'import { y } from "@authbox/crypto/encoding";',
      'import { z } from "@authbox/api-client/login";',
      'import { t } from "@authbox/shared/types/vault";',
      'const s = btoa("x");',
      'fetch(`${base}/api/v1/vault/items`);',
    ].join("\n"),
    "packages/shared/src/c.ts": 'import { w } from "../../crypto/src/srp";\nimport { v } from "@authbox/web";',
    "packages/crypto/src/encoding.ts": "export function toBase64() {}",
    "apps/web/lib/a.test.ts": 'const s = btoa("x");',
  };
  const got = check(Object.keys(fixture), (f) => fixture[f]);
  const expected = [
    "packages/crypto/src/leftover.js: [build-output-in-src]",
    "apps/web/tsconfig.json: [tsconfig-paths-into-src]",
    "apps/web/lib/a.ts: [app-imports-app]",
    "apps/web/lib/a.ts: [import-outside-exports]",
    "apps/web/lib/a.ts: [local-codec]",
    "apps/web/lib/a.ts: [api-call-outside-client]",
    "packages/shared/src/c.ts: [deep-relative-import]",
    "packages/shared/src/c.ts: [package-imports-app]",
  ];
  const missing = expected.filter((e) => !got.some((g) => g.startsWith(e)));
  if (missing.length || got.length !== expected.length) {
    console.error("self-test FAILED\nexpected:\n  " + expected.join("\n  ") + "\ngot:\n  " + got.join("\n  "));
    process.exit(1);
  }
  console.log(`check-architecture self-test: ${expected.length} rules fired as expected`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const files = listFiles();
  const violations = check(files, (f) => readFileSync(path.join(ROOT, f), "utf8"));
  if (violations.length) {
    console.error(violations.join("\n"));
    console.error(`\n${violations.length} architecture violation(s). See doc/00_project/initiative_10_auth_box/ARCHITECTURE_ADR.md.`);
    process.exit(1);
  }
  console.log(`check-architecture: ${files.length} files, 0 violations`);
}
