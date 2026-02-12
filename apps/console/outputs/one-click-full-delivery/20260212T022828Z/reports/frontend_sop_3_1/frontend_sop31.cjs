const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(path.resolve(process.cwd(), 'node_modules/playwright'));

const baseUrl = process.argv[2];
const outDir = process.argv[3];
const screenshotsDir = path.join(outDir, 'screenshots');
const baselineDir = path.join(outDir, 'visual_baseline');
fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(baselineDir, { recursive: true });

const routes = [
  '/',
  '/product',
  '/compare/hashicorp-vault-alternative',
  '/platforms/new?source=sop31&tenant_id=beta',
  '/metrics/funnel?window_minutes=180&tenant_id=beta'
];
const dynamicVisualRoutes = new Set(['/metrics/funnel?window_minutes=180&tenant_id=beta']);
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 }
];

function slugify(input) {
  return input.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'home';
}
function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function isIgnorableAbort(reqFail) {
  return reqFail.error_text === 'net::ERR_ABORTED' && reqFail.url.includes('_rsc=');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    scope: 'SOP 3.1 frontend full checks',
    checks: {
      network: { pass: true, failed_requests: [], failed_requests_ignored: [], http_errors: [] },
      console: { pass: true, errors: [], page_errors: [] },
      performance: { pass: true, warnings: [], samples: [] },
      responsive: { pass: true, overflows: [], samples: [] },
      visual_regression: { pass: true, baseline_created: [], changed: [], unchanged: [], excluded_dynamic: [] }
    },
    pages: []
  };

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const route of routes) {
      const page = await context.newPage();
      const pageRec = {
        viewport: vp.name,
        route,
        url: `${baseUrl}${route}`,
        console_errors: [],
        page_errors: [],
        request_failed: [],
        response_errors: [],
        navigation: null,
        responsive: null,
        screenshot: null
      };

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          pageRec.console_errors.push(text);
          report.checks.console.errors.push({ viewport: vp.name, route, text });
          report.checks.console.pass = false;
        }
      });
      page.on('pageerror', (error) => {
        const text = String(error);
        pageRec.page_errors.push(text);
        report.checks.console.page_errors.push({ viewport: vp.name, route, text });
        report.checks.console.pass = false;
      });
      page.on('requestfailed', (req) => {
        const fail = req.failure();
        const item = { viewport: vp.name, route, method: req.method(), url: req.url(), error_text: fail ? fail.errorText : 'unknown' };
        pageRec.request_failed.push(item);
        if (isIgnorableAbort(item)) {
          report.checks.network.failed_requests_ignored.push(item);
        } else {
          report.checks.network.failed_requests.push(item);
          report.checks.network.pass = false;
        }
      });
      page.on('response', (resp) => {
        if (resp.status() >= 400) {
          const item = { viewport: vp.name, route, url: resp.url(), status: resp.status() };
          pageRec.response_errors.push(item);
          report.checks.network.http_errors.push(item);
          report.checks.network.pass = false;
        }
      });

      const start = Date.now();
      await page.goto(pageRec.url, { waitUntil: 'networkidle', timeout: 60000 });
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
      pageRec.navigation = Object.assign({ elapsed_ms: Date.now() - start }, nav || {});
      report.checks.performance.samples.push({ viewport: vp.name, route, ...pageRec.navigation });
      if (typeof pageRec.navigation.load_event_ms === 'number' && pageRec.navigation.load_event_ms > 7000) {
        report.checks.performance.pass = false;
        report.checks.performance.warnings.push({ viewport: vp.name, route, message: `load_event_ms=${pageRec.navigation.load_event_ms}` });
      }

      const responsive = await page.evaluate(() => ({
        inner_width: window.innerWidth,
        scroll_width: document.documentElement.scrollWidth,
        has_overflow: document.documentElement.scrollWidth > window.innerWidth + 1
      }));
      pageRec.responsive = responsive;
      report.checks.responsive.samples.push({ viewport: vp.name, route, ...responsive });
      if (responsive.has_overflow) {
        report.checks.responsive.pass = false;
        report.checks.responsive.overflows.push({ viewport: vp.name, route, inner_width: responsive.inner_width, scroll_width: responsive.scroll_width });
      }

      const fileSlug = `${vp.name}_${slugify(route)}`;
      const screenshotPath = path.join(screenshotsDir, `${fileSlug}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      pageRec.screenshot = screenshotPath;

      if (dynamicVisualRoutes.has(route)) {
        report.checks.visual_regression.excluded_dynamic.push({ viewport: vp.name, route });
      } else {
        const baselinePath = path.join(baselineDir, `${fileSlug}.png`);
        if (!fs.existsSync(baselinePath)) {
          fs.copyFileSync(screenshotPath, baselinePath);
          report.checks.visual_regression.baseline_created.push({ viewport: vp.name, route });
        } else {
          const currentHash = hashFile(screenshotPath);
          const baselineHash = hashFile(baselinePath);
          if (currentHash !== baselineHash) {
            report.checks.visual_regression.changed.push({ viewport: vp.name, route, baseline: baselinePath, current: screenshotPath });
            report.checks.visual_regression.pass = false;
          } else {
            report.checks.visual_regression.unchanged.push({ viewport: vp.name, route });
          }
        }
      }

      report.pages.push(pageRec);
      await page.close();
    }
    await context.close();
  }

  await browser.close();

  const reportPath = path.join(outDir, 'frontend_sop31_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const assertion = [
    `network.pass=${report.checks.network.pass ? 'PASS' : 'FAIL'}`,
    `console.pass=${report.checks.console.pass ? 'PASS' : 'FAIL'}`,
    `performance.pass=${report.checks.performance.pass ? 'PASS' : 'FAIL'}`,
    `responsive.pass=${report.checks.responsive.pass ? 'PASS' : 'FAIL'}`,
    `visual.pass=${report.checks.visual_regression.pass ? 'PASS' : 'FAIL'}`
  ].join(',');

  fs.writeFileSync(path.join(outDir, 'frontend_sop31_assertion.txt'), `${assertion}\n`);
  console.log(assertion);
})();
