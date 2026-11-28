const assert = require('node:assert/strict');
const {apps} = require('./apps.cjs');
const { launchBrowser, createContext, captureFailure, closeBrowser, waitForApp } = require('./browser-harness.cjs');
const { macBookAir13, iphone14Pro } = require('../test-devices.cjs');
async function authorizeStagedContext(context, origin, bypass) {
  if (!bypass) return;
  await context.route(url => url.origin === origin, async route => {
    // Fulfill the first response without following redirects. The browser's next
    // request is routed afresh, so a redirect cannot carry this header elsewhere.
    try {
      const response = await route.fetch({ maxRedirects: 0, headers: { ...route.request().headers(), 'x-vercel-protection-bypass': bypass } });
      await route.fulfill({ response });
    } catch {
      // Playwright's raw error includes request headers. Never log or rethrow it.
      // A failed critical resource will fail the ordinary page readiness check.
      await route.abort('failed').catch(() => {});
    }
  });
}
async function closeSmokeContext(context) {
  // Closing the owner aborts route.fetch downloads and releases its handlers.
  // Draining handlers first can wait forever on a background response body.
  await context.close();
}
async function smokeBrowser(origin, app, { bypass } = {}) {
  const browser = await launchBrowser();
  try {
    for (const [device, options] of Object.entries({ desktop: macBookAir13, phone: iphone14Pro })) {
      const context = await createContext(browser, { ...options, reducedMotion: 'reduce' }, { trace: !bypass });
      context.setDefaultTimeout(30000);
      context.setDefaultNavigationTimeout(45000);
      // Restrict the staging credential to this exact origin. Never expose it to
      // analytics, account services, redirected hosts, traces or the live check.
      await authorizeStagedContext(context, origin, bypass);
      const page = await context.newPage(), errors = [];
      console.log(`Checking ${app} ${device}: application startup`);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await waitForApp(page, app === 'soundglow' ? '.soundglow-header' : '#practice-content');
      if (app === 'dorego') await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
      else if (app === 'songalong') await page.locator('.hymn-paper svg').first().waitFor();
      else if (app === 'notewise') await page.locator('#notation svg').first().waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${app} ${device} overflow`);
      assert.deepEqual(errors, [], `${app} ${device} runtime errors`);
      if (app !== 'soundglow' && apps[app]?.accounts !== false) {
        console.log(`Checking ${app} ${device}: isolated email confirmation`);
        await page.addInitScript(() => { window.__confirmationDatabaseOpens = 0; const open = indexedDB.open.bind(indexedDB); indexedDB.open = (...args) => { window.__confirmationDatabaseOpens++; return open(...args); }; });
        await page.goto(origin + '/auth/confirm#token_hash=deployment-check-never-submitted&type=email');
        await page.getByRole('heading', { name: 'Confirm sign-in', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.__confirmationDatabaseOpens), 0);
        assert.equal(await page.evaluate(async () => (await navigator.locks.query()).held.some(lock => lock.name?.endsWith('-writer'))), false);
      }
      console.log(`Checking ${app} ${device}: context cleanup`);
      await closeSmokeContext(context);
      console.log(`PASS ${app} ${device} browser smoke`);
    }
    console.log(`PASS ${app}: MacBook Air and iPhone 14 Pro${app === 'soundglow' ? '' : ', with isolated email confirmation'}`);
  } catch (error) { await captureFailure(browser, error); throw error; }
  finally { await closeBrowser(browser); }
}
module.exports = { smokeBrowser, authorizeStagedContext, closeSmokeContext };
