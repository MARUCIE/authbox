const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(path.resolve(process.cwd(), 'node_modules/playwright'));
const baseUrl = process.argv[2];
const outDir = process.argv[3];
const screenshotDir = path.join(outDir, 'screenshots');
const baselineDir = path.join(outDir, 'visual_baseline');
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(baselineDir, { recursive: true });
const routes = ['/', '/product', '/compare/hashicorp-vault-alternative', '/platforms/new?source=frontend_audit&tenant_id=beta', '/metrics/funnel?window_minutes=180&tenant_id=beta'];
const dynamicVisualRoutes = new Set(['/metrics/funnel?window_minutes=180&tenant_id=beta']);
const slugify = (r) => r.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'home';
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const isIgnorableAbort = (record) => record.error_text === 'net::ERR_ABORTED' && record.url.includes('_rsc=');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const report = { generated_at: new Date().toISOString(), base_url: baseUrl, checks: { network: { pass: true, failed_requests: [], failed_requests_ignored: [], http_errors: [] }, console: { pass: true, errors: [], page_errors: [] }, performance: { pass: true, warnings: [], pages: [] }, visual_regression: { pass: true, baseline_created: [], changed: [], unchanged: [], excluded_dynamic: [] } }, pages: [] };
  for (const route of routes) {
    const page = await context.newPage();
    const rec = { route, url: `${baseUrl}${route}`, navigation: null, screenshot: null, console_errors: [], page_errors: [], request_failed: [], response_errors: [] };
    page.on('console', (msg) => { if (msg.type() === 'error') { const t = msg.text(); rec.console_errors.push(t); report.checks.console.errors.push({ route, text: t }); report.checks.console.pass = false; } });
    page.on('pageerror', (err) => { const t = String(err); rec.page_errors.push(t); report.checks.console.page_errors.push({ route, text: t }); report.checks.console.pass = false; });
    page.on('requestfailed', (req) => { const f=req.failure(); const item={route,url:req.url(),method:req.method(),error_text:f?f.errorText:'unknown'}; rec.request_failed.push(item); if (isIgnorableAbort(item)) report.checks.network.failed_requests_ignored.push(item); else { report.checks.network.failed_requests.push(item); report.checks.network.pass=false; } });
    page.on('response', (resp) => { if (resp.status() >= 400) { const item={route,url:resp.url(),status:resp.status()}; rec.response_errors.push(item); report.checks.network.http_errors.push(item); report.checks.network.pass=false; } });
    const start=Date.now(); await page.goto(rec.url,{waitUntil:'networkidle',timeout:60000});
    const nav=await page.evaluate(()=>{const e=performance.getEntriesByType('navigation')[0]; if(!e) return null; return {dom_content_loaded_ms:Number(e.domContentLoadedEventEnd.toFixed(2)),load_event_ms:Number(e.loadEventEnd.toFixed(2)),response_end_ms:Number(e.responseEnd.toFixed(2)),duration_ms:Number(e.duration.toFixed(2)),transfer_size:e.transferSize||0};});
    rec.navigation=Object.assign({elapsed_ms:Date.now()-start},nav||{}); report.checks.performance.pages.push(Object.assign({route},rec.navigation));
    if (typeof rec.navigation.load_event_ms==='number' && rec.navigation.load_event_ms>5000) { report.checks.performance.pass=false; report.checks.performance.warnings.push({route,message:`load_event_ms=${rec.navigation.load_event_ms}`}); }
    const slug=slugify(route); const shot=path.join(screenshotDir, `${slug}.png`); await page.screenshot({path:shot,fullPage:true}); rec.screenshot=shot;
    if (dynamicVisualRoutes.has(route)) {
      report.checks.visual_regression.excluded_dynamic.push(route);
    } else {
      const baseline=path.join(baselineDir, `${slug}.png`);
      if (!fs.existsSync(baseline)) { fs.copyFileSync(shot, baseline); report.checks.visual_regression.baseline_created.push(route); }
      else { const ch=sha256(shot), bh=sha256(baseline); if (ch!==bh) { report.checks.visual_regression.changed.push({route,baseline,current:shot}); report.checks.visual_regression.pass=false; } else report.checks.visual_regression.unchanged.push(route); }
    }
    report.pages.push(rec); await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir,'frontend_audit_report.json'), JSON.stringify(report,null,2));
  const a=[`network.pass=${report.checks.network.pass?'PASS':'FAIL'}`,`console.pass=${report.checks.console.pass?'PASS':'FAIL'}`,`performance.pass=${report.checks.performance.pass?'PASS':'FAIL'}`,`visual.pass=${report.checks.visual_regression.pass?'PASS':'FAIL'}`].join(',');
  fs.writeFileSync(path.join(outDir,'frontend_audit_assertion.txt'), a+'\n');
  console.log(a);
})();
