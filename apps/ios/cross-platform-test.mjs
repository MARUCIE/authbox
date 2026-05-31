#!/usr/bin/env node

/**
 * Stable Node entry point for the iOS/Web crypto vector generator.
 *
 * The TypeScript package build emits extensionless ESM imports, so direct
 * `node packages/crypto/dist/index.js` loading is not portable across the
 * current Node runtime. Keep the vector logic in the TypeScript source file
 * and execute it through the pinned `tsx` dev dependency.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '../..');
const vectorScript = resolve(scriptDir, 'cross-platform-test.ts');

const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'tsx', vectorScript],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
