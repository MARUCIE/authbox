#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(base: Path, strict: bool) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    checks: dict[str, object] = {}

    required_files = [
        "package.json",
        "pnpm-workspace.yaml",
        "turbo.json",
        "Makefile",
        "docker-compose.yml",
        ".env.example",
        "apps/web/package.json",
        "apps/console/package.json",
        "apps/extension/package.json",
        "packages/crypto/package.json",
        "packages/shared/package.json",
        "packages/mcp-protocol/package.json",
        "services/api/go.mod",
        "services/api/cmd/api/main.go",
        "scripts/e2e-test.mjs",
    ]
    missing = [rel for rel in required_files if not (base / rel).exists()]
    if missing:
        errors.append(f"missing required files: {', '.join(missing)}")
    checks["required_files"] = {"ok": not missing, "missing": missing}

    workspace_names: dict[str, list[str]] = {}
    package_files = sorted(base.glob("apps/*/package.json")) + sorted(base.glob("packages/*/package.json"))
    for pkg_file in package_files:
        try:
            pkg = read_json(pkg_file)
        except Exception as exc:
            errors.append(f"failed to parse {pkg_file.relative_to(base)}: {exc}")
            continue
        name = str(pkg.get("name", "")).strip()
        if not name:
            errors.append(f"missing package name: {pkg_file.relative_to(base)}")
            continue
        workspace_names.setdefault(name, []).append(str(pkg_file.relative_to(base)))

    duplicates = {name: paths for name, paths in workspace_names.items() if len(paths) > 1}
    if duplicates:
        errors.append(f"duplicate workspace package names: {duplicates}")
    checks["workspace_packages"] = {
        "ok": not duplicates and bool(workspace_names),
        "count": len(workspace_names),
        "duplicates": duplicates,
    }

    root_pkg = read_json(base / "package.json")
    scripts = root_pkg.get("scripts", {})
    for required_script in ["build", "test", "lint"]:
        if required_script not in scripts:
            warnings.append(f"root package.json missing script: {required_script}")
    checks["root_scripts"] = {
        "ok": all(name in scripts for name in ["build", "test"]),
        "scripts": sorted(scripts.keys()),
    }

    if not (base / "doc/index.md").exists():
        errors.append("missing doc/index.md")
    initiative_dir = base / "doc/00_project/initiative_10_auth_box"
    if not initiative_dir.exists():
        errors.append("missing initiative docs directory: doc/00_project/initiative_10_auth_box")
    checks["docs_root"] = {
        "ok": (base / "doc/index.md").exists() and initiative_dir.exists(),
        "initiative_dir": str(initiative_dir),
    }

    if strict and warnings:
        errors.extend(f"strict-warning: {warning}" for warning in warnings)

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("--json", action="store_true")
    validate_parser.add_argument("--strict", action="store_true")

    args = parser.parse_args()
    base = Path(__file__).resolve().parents[1]

    if args.command == "validate":
        result = validate(base, strict=bool(args.strict))
        if args.json:
            print(json.dumps(result, ensure_ascii=False))
        else:
            print("OK" if result["ok"] else "FAIL")
            for error in result["errors"]:
                print(f"ERROR: {error}")
            for warning in result["warnings"]:
                print(f"WARN: {warning}")
        return 0 if result["ok"] else 1

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
