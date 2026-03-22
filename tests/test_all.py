#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str]) -> int:
    env = os.environ.copy()
    env.setdefault("CI", "1")
    print(f"$ {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=REPO_ROOT, env=env)
    print(f"[exit={proc.returncode}] {' '.join(cmd)}", flush=True)
    return proc.returncode


def main() -> int:
    commands = [
        ["make", "test-api"],
        ["make", "test-crypto"],
        ["pnpm", "--filter", "@authbox/web", "build"],
        ["pnpm", "--filter", "auth-box-console", "build"],
        ["pnpm", "--filter", "@authbox/extension", "build"],
    ]

    for cmd in commands:
        code = run(cmd)
        if code != 0:
            return code

    print("ALL PROJECT TESTS PASSED", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
