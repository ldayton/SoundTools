// Exercise real browser redirects as well as ordinary external subresources.
const assert = require('node:assert/strict');
const http = require('node:http');
const { launchBrowser, createContext, newPage, closeBrowser, captureFailure } = require('../../scripts/ci/browser-harness.cjs');
const { authorizeStagedContext, closeSmokeContext } = require('../../scripts/ci/smoke-browser.cjs');
const { stagedRequest } = require('../../scripts/ci/release.cjs');
let browser;
let heldResponse, heldStarted, heldClosed;
const started = new Promise(resolve => { heldStarted = resolve; });
const closed = new Promise(resolve => { heldClosed = resolve; });
const observed = [];
const external = http.createServer((req, res) => { observed.push({ external: true, bypass: req.headers['x-vercel-protection-bypass'] }); res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('external'); });
const stage = http.createServer((req, res) => {
  observed.push({ external: false, bypass: req.headers['x-vercel-protection-bypass'] });
  if (req.url === '/held') {
    heldResponse = res;
    res.once('close', heldClosed);
    heldStarted();
    return; // Deliberately hold a routed background request past smoke assertions.
  }
  if (req.url === '/redirect') res.writeHead(302, { Location: externalOrigin + '/from-redirect' }).end();
  else res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Stage</title>Stage');
});
let externalOrigin;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
(async () => {
  await listen(external); await listen(stage);
  externalOrigin = `http://127.0.0.1:${external.address().port}`;
  const origin = `http://127.0.0.1:${stage.address().port}`, bypass = 'dummy-staging-credential';
  browser = await launchBrowser();
  const context = await createContext(browser, { permissions: ['local-network-access'] }, { trace: false });
  await authorizeStagedContext(context, origin, bypass);
  const page = await context.newPage();
  page.on("console", m => { if (m.type() === "error") console.error(m.text()); });
  page.on("requestfailed", r => console.error("request failed", r.url(), r.failure()));
  await page.goto(origin);
  assert.equal(await page.evaluate(url => fetch(url).then(r => r.text()), externalOrigin), 'external');
  assert.equal(await page.evaluate(url => fetch(url).then(r => r.text()), origin + '/redirect'), 'external');
  assert(observed.filter(r => !r.external).every(r => r.bypass === bypass));
  assert(observed.filter(r => r.external).length >= 2);
  assert(observed.filter(r => r.external).every(r => r.bypass === undefined));
  const before = observed.filter(r => r.external).length;
  await assert.rejects(stagedRequest(origin, bypass)(origin + '/redirect'));
  assert.equal(observed.filter(r => r.external).length, before);
  const owned = await newPage(browser);
  const released = owned.context().waitForEvent('close');
  await owned.close(); await released;
  assert(!browser.contexts().includes(owned.context()), 'Closing a helper-owned page releases its context and trace buffers');
  await page.evaluate(() => { void fetch('/held').catch(() => {}); });
  await started;
  let deadline;
  try {
    await Promise.race([
      closeSmokeContext(context),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(Error('Smoke cleanup waited for an unfinished background request')), 5000); }),
    ]);
  } finally { clearTimeout(deadline); }
  await closed;
  assert(!browser.contexts().includes(context), 'Smoke cleanup closes its browser context');
  assert(observed.filter(r => !r.external).every(r => r.bypass === bypass));
  console.log('PASS: staging credentials stay on their exact origin, including across real browser and HTTP redirects');
  console.log('PASS: smoke cleanup aborts routed background requests instead of waiting for their bodies');
})().catch(async error => { await captureFailure(browser, error); console.error(error); process.exitCode = 1; }).finally(async () => { heldResponse?.end('fixture cleanup'); await closeBrowser(browser); stage.closeAllConnections(); external.closeAllConnections(); stage.close(); external.close(); });
