#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULTS = {
  mode: 'both',
  route: '/login',
  liveBaseUrl: 'https://authbox.io',
  localOutDir: 'apps/web/out',
  pageChunkSubpath: 'app/(auth)/login/page-',
  outputPath: '',
};

const REQUIRED_PATTERNS = [
  {
    id: 'login_verify_includes_client_public_a',
    regex: /loginVerify\(\{[^)]*clientPublicA/s,
    description: 'login verify payload includes clientPublicA',
  },
];

const FORBIDDEN_PATTERNS = [
  {
    id: 'legacy_trycloudflare_fallback',
    regex: /trycloudflare/,
    description: 'legacy trycloudflare fallback is absent',
  },
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') {
      args.mode = argv[++i] ?? '';
    } else if (arg === '--route') {
      args.route = argv[++i] ?? '';
    } else if (arg === '--live-base-url') {
      args.liveBaseUrl = argv[++i] ?? '';
    } else if (arg === '--local-out-dir') {
      args.localOutDir = argv[++i] ?? '';
    } else if (arg === '--page-chunk-subpath') {
      args.pageChunkSubpath = argv[++i] ?? '';
    } else if (arg === '--output') {
      args.outputPath = argv[++i] ?? '';
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  if (!['local', 'live', 'both'].includes(args.mode)) {
    throw new Error(`Unsupported --mode: ${args.mode}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/public_bundle_smoke.mjs [--mode local|live|both]
                                       [--route /login]
                                       [--live-base-url https://authbox.io]
                                       [--local-out-dir apps/web/out]
                                       [--page-chunk-subpath app/(auth)/login/page-]
                                       [--output <path>]

Checks the login page bundle for release-critical semantic markers:
  - loginVerify payload must include clientPublicA
  - trycloudflare fallback must be absent`);
}

function routeToHtmlPath(route, localOutDir) {
  if (route === '/' || route === '') {
    return path.join(localOutDir, 'index.html');
  }
  return path.join(localOutDir, `${route.replace(/^\/+/, '')}.html`);
}

function extractScriptPaths(html) {
  const scriptPaths = [];
  const pattern = /<script[^>]+src="([^"]+\.js)"[^>]*>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    scriptPaths.push(match[1]);
  }
  return scriptPaths;
}

function selectPageChunk(scriptPaths, pageChunkSubpath) {
  return scriptPaths.find((scriptPath) => scriptPath.includes(pageChunkSubpath)) ?? null;
}

function runPatternChecks(content) {
  return {
    required: REQUIRED_PATTERNS.map((pattern) => ({
      id: pattern.id,
      description: pattern.description,
      found: pattern.regex.test(content),
    })),
    forbidden: FORBIDDEN_PATTERNS.map((pattern) => ({
      id: pattern.id,
      description: pattern.description,
      found: pattern.regex.test(content),
    })),
  };
}

function computePass(checks) {
  const requiredOk = checks.required.every((check) => check.found);
  const forbiddenOk = checks.forbidden.every((check) => !check.found);
  return requiredOk && forbiddenOk;
}

async function inspectLocal(args) {
  const htmlPath = routeToHtmlPath(args.route, args.localOutDir);
  const html = await readFile(htmlPath, 'utf8');
  const scriptPaths = extractScriptPaths(html);
  const pageChunkPath = selectPageChunk(scriptPaths, args.pageChunkSubpath);
  if (!pageChunkPath) {
    throw new Error(`Local page chunk not found for subpath: ${args.pageChunkSubpath}`);
  }

  const localAssetPath = path.join(args.localOutDir, pageChunkPath.replace(/^\/+/, ''));
  const pageChunk = await readFile(localAssetPath, 'utf8');
  const checks = runPatternChecks(pageChunk);

  return {
    mode: 'local',
    route: args.route,
    html_path: htmlPath,
    page_chunk_path: pageChunkPath,
    script_count: scriptPaths.length,
    checks,
    pass: computePass(checks),
  };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${url} -> ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function inspectLive(args) {
  const routeUrl = new URL(args.route.replace(/^\/?/, '/'), args.liveBaseUrl).toString();
  const html = await fetchText(routeUrl);
  const scriptPaths = extractScriptPaths(html);
  const pageChunkPath = selectPageChunk(scriptPaths, args.pageChunkSubpath);
  if (!pageChunkPath) {
    throw new Error(`Live page chunk not found for subpath: ${args.pageChunkSubpath}`);
  }

  const pageChunkUrl = new URL(pageChunkPath, args.liveBaseUrl).toString();
  const pageChunk = await fetchText(pageChunkUrl);
  const checks = runPatternChecks(pageChunk);

  return {
    mode: 'live',
    route: args.route,
    route_url: routeUrl,
    page_chunk_path: pageChunkPath,
    page_chunk_url: pageChunkUrl,
    script_count: scriptPaths.length,
    checks,
    pass: computePass(checks),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = {
    generated_at: new Date().toISOString(),
    mode: args.mode,
    route: args.route,
    page_chunk_subpath: args.pageChunkSubpath,
  };

  if (args.mode === 'local' || args.mode === 'both') {
    report.local = await inspectLocal(args);
  }

  if (args.mode === 'live' || args.mode === 'both') {
    report.live = await inspectLive(args);
  }

  const scopes = [report.local, report.live].filter(Boolean);
  report.pass = scopes.every((scope) => scope.pass);

  const output = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(output);

  if (args.outputPath) {
    await mkdir(path.dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, 'utf8');
  }

  if (!report.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
