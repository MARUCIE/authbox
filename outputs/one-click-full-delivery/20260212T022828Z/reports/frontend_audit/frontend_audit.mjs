import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const baseUrl = process.argv[2];
const outDir = process.argv[3];
const screenshotDir = path.join(outDir, 'screenshots');
const baselineDir = path.join(outDir, 'visual_baseline');
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(baselineDir, { recursive: true });

const routes = [
  '/',
  '/product',
  '/compare/hashicorp-vault-alternative',
  '/platforms/new?source=frontend_audit&tenant_id=beta',
  '/metrics/funnel?window_minutes=180&tenant_id=beta'
];

function slugify(route) {
  return route
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'home';
}

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  checks: {
    network: { pass: true, failed_requests: [], http_errors: [] },
    console: { pass: true, errors: [], page_errors: [] },
    performance: { pass: true, warnings: [], pages: [] },
    visual_regression: { pass: true, baseline_created: [], changed: [], unchanged: [] }
  },
  pages: []
};

for (const route of routes) {
  const page = await context.newPage();
  const pageRecord = {
    route,
    url: `${baseUrl}${route}`,
    navigation: null,
    screenshot: null,
    console_errors: [],
    page_errors: [],
    request_failed: [],
    response_errors: []
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      pageRecord.console_errors.push(text);
      report.checks.console.errors.push({ route, text });
      report.checks.console.pass = false;
    }
  });

  page.on('pageerror', (error) => {
    const text = String(error);
    pageRecord.page_errors.push(text);
    report.checks.console.page_errors.push({ route, text });
    report.checks.console.pass = false;
  });

  page.on('requestfailed', (req) => {
    const failure = req.failure();
    const record = { route, url: req.url(), method: req.method(), error_text: failure?.errorText || 'unknown' };
    pageRecord.request_failed.push(record);
    report.checks.network.failed_requests.push(record);
    report.checks.network.pass = false;
  });

  page.on('response', (resp) => {
    const status = resp.status();
    if (status >= 400) {
      const record = { route, url: resp.url(), status };
      pageRecord.response_errors.push(record);
      report.checks.network.http_errors.push(record);
      report.checks.network.pass = false;
    }
  });

  const start = Date.now();
  await page.goto(pageRecord.url, { waitUntil: 'networkidle', timeout: 60000 });
  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    if (!entry) return null;
    return {
      dom_content_loaded_ms: Number(entry.domContentLoadedEventEnd.toFixed(2)),
      load_event_ms: Number(entry.loadEventEnd.toFixed(2)),
      response_end_ms: Number(entry.responseEnd.toFixed(2)),
      duration_ms: Number(entry.duration.toFixed(2)),
      transfer_size: entry.transferSize || 0
    };
  });
  const elapsed = Date.now() - start;
  pageRecord.navigation = { elapsed_ms: elapsed, ...(nav || {}) };
  report.checks.performance.pages.push({ route, ...(pageRecord.navigation || {}) });

  if (typeof pageRecord.navigation.load_event_ms === 'number' && pageRecord.navigation.load_event_ms > 5000) {
    report.checks.performance.pass = false;
    report.checks.performance.warnings.push({ route, message: `load_event_ms=${pageRecord.navigation.load_event_ms}` });
  }

  const slug = slugify(route);
  const shotPath = path.join(screenshotDir, `${slug}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  pageRecord.screenshot = shotPath;

  const baselinePath = path.join(baselineDir, `${slug}.png`);
  if (!fs.existsSync(baselinePath)) {
    fs.copyFileSync(shotPath, baselinePath);
    report.checks.visual_regression.baseline_created.push(route);
  } else {
    const currentHash = sha256(shotPath);
    const baselineHash = sha256(baselinePath);
    if (currentHash !== baselineHash) {
      report.checks.visual_regression.changed.push({ route, baseline: baselinePath, current: shotPath });
      report.checks.visual_regression.pass = false;
    } else {
      report.checks.visual_regression.unchanged.push(route);
    }
  }

  report.pages.push(pageRecord);
  await page.close();
}

await browser.close();

const reportPath = path.join(outDir, 'frontend_audit_report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const assertion = [
  `network.pass=${report.checks.network.pass ? 'PASS' : 'FAIL'}`,
  `console.pass=${report.checks.console.pass ? 'PASS' : 'FAIL'}`,
  `performance.pass=${report.checks.performance.pass ? 'PASS' : 'FAIL'}`,
  `visual.pass=${report.checks.visual_regression.pass ? 'PASS' : 'FAIL'}`
].join(',');
fs.writeFileSync(path.join(outDir, 'frontend_audit_assertion.txt'), assertion + '\n');

console.log(assertion);
