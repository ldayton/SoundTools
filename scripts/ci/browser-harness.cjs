const { chromium, firefox, webkit } = require('playwright');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const engines = { chromium, firefox, webkit };
const contexts = new WeakMap();
function browserName(env = process.env) {
  const name = env.TEST_BROWSER || env.SOUNDGLOW_TEST_BROWSER || 'chromium';
  if (!Object.hasOwn(engines, name)) throw Error(`Unknown test browser: ${name}`);
  return name;
}
async function launchBrowser(options = {}) {
  const name = browserName();
  const home = name === 'firefox' && process.platform === 'darwin' && !options.env?.CFFIXED_USER_HOME
    ? await mkdtemp(path.join(tmpdir(), 'soundtools-firefox-')) : undefined;
  try {
    const env = { ...process.env, ...options.env, ...(home ? { CFFIXED_USER_HOME: home } : {}) };
    for (const key of ['VERCEL_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'SENTRY_AUTH_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET']) delete env[key];
    const browser = await engines[name].launch({ headless: process.env.HEADED !== '1', ...options,
      args: [...(name === 'chromium' ? ['--mute-audio'] : []), ...(options.args || [])],
      env,
    });
    if (home) browser.on('disconnected', () => void rm(home, { recursive: true, force: true }).catch(() => {}));
    return browser;
  } catch (e) { if (home) await rm(home, { recursive: true, force: true }).catch(() => {}); throw e; }
}
function clean(value) { return String(value).replace(/([?&#](?:token_hash|access_token|refresh_token|code)=)[^&#\s]+/g, '$1[redacted]'); }
async function createContext(browser, options = {}, { trace = process.env.CI_TRACE !== '0' } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', ...options });
  const state = { logs: [], tracing: false };
  contexts.set(context, state);
  function log(entry) { state.logs.push(clean(entry)); if (state.logs.length > 200) state.logs.shift(); }
  context.on('page', page => {
    page.on('pageerror', e => log(`error: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log(`${m.type()}: ${m.text()}`); });
    page.on('requestfailed', r => log(`request: ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  });
  if (trace) {
    await context.tracing.start({ snapshots: true, sources: true, screenshots: false });
    state.tracing = true;
  }
  return context;
}
const createOfflineContext = (browser, options = {}, capture) => createContext(browser, { serviceWorkers: 'allow', ...options }, capture);
async function ownedPage(context) {
  try {
    const page = await context.newPage();
    // Match browser.newPage(): callers closing the page also release its private
    // context and trace buffers, including in large catalog/layout loops.
    page.once('close', () => { void context.close().catch(() => {}); });
    return page;
  } catch (error) { await context.close(); throw error; }
}
async function newPage(browser, options = {}) { return ownedPage(await createContext(browser, options)); }
async function newOfflinePage(browser, options = {}) { return ownedPage(await createOfflineContext(browser, options)); }
async function captureFailure(browser, error, destination) {
  const name = path.basename(process.argv[1] || 'browser').replace(/[^a-zA-Z0-9_.-]/g, '-');
  const directory = destination || path.resolve(process.env.CI_ARTIFACTS || 'work/browser-results', `${name}-${browserName()}-${randomUUID().slice(0, 8)}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'error.txt'), clean(error?.stack || error));
  for (const [index, context] of (browser?.contexts() || []).entries()) {
    const state = contexts.get(context);
    if (state) {
      await writeFile(path.join(directory, `context-${index}.log`), state.logs.join('\n'));
      if (state.tracing) { await context.tracing.stop({ path: path.join(directory, `trace-${index}.zip`) }).catch(() => {}); state.tracing = false; }
    }
    for (const [p, page] of context.pages().entries()) await page.screenshot({ path: path.join(directory, `page-${index}-${p}.png`), fullPage: true, timeout: 5000 }).catch(() => {});
  }
  console.error(`Browser failure artifacts: ${directory}`);
  return directory;
}
async function closeBrowser(browser) {
  if (!browser) return;
  for (const context of browser.contexts()) {
    const state = contexts.get(context);
    if (state?.tracing) { await context.tracing.stop().catch(() => {}); state.tracing = false; }
  }
  await browser.close();
}
async function waitForApp(page, selector) {
  await page.waitForFunction(() => !!window.__soundtoolsStartup?.ready);
  if (selector) await page.locator(selector).waitFor({ state: 'visible' });
}
// A rendered control is not evidence that its account state has been restored.
async function waitForAccountIdle(page, { timeout = 15000 } = {}) {
  await page.waitForFunction(() => !!document.querySelector('[data-account-status="synced"][data-account-pending="0"]'), undefined, { timeout });
}
async function waitForDialogClosed(page, selector, { timeout = 5000 } = {}) {
  await page.locator(selector).waitFor({ state: 'hidden', timeout });
}
async function waitForServer(url, { server, timeout = 15000 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (server && server.exitCode !== null) throw Error('Test preview exited before it became ready');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(`Test preview did not become ready: ${url}`);
}
module.exports = { browserName, launchBrowser, createContext, createOfflineContext, newPage, newOfflinePage, captureFailure, closeBrowser, waitForApp, waitForAccountIdle, waitForDialogClosed, waitForServer, clean };
