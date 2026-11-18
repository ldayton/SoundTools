const assert = require('node:assert/strict');
const { launchBrowser, createContext, captureFailure, closeBrowser, waitForApp } = require('./browser-harness.cjs');
const { macBookAir13, iphone14Pro } = require('../test-devices.cjs');
async function smokeBrowser(origin, app) {
  const browser = await launchBrowser();
  try {
    for (const [device, options] of Object.entries({ desktop: macBookAir13, phone: iphone14Pro })) {
      const context = await createContext(browser, { ...options, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await waitForApp(page, app === 'soundglow' ? '.soundglow-header' : '#practice-content');
      if (app === 'dorego') await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
      else if (app === 'songalong') await page.locator('.hymn-paper svg').first().waitFor();
      else if (app === 'notewise') await page.locator('#notation svg').first().waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${app} ${device} overflow`);
      assert.deepEqual(errors, [], `${app} ${device} runtime errors`);
      if (app !== 'soundglow') {
        await page.addInitScript(() => { window.__confirmationDatabaseOpens = 0; const open = indexedDB.open.bind(indexedDB); indexedDB.open = (...args) => { window.__confirmationDatabaseOpens++; return open(...args); }; });
        await page.goto(origin + '/auth/confirm#token_hash=deployment-check-never-submitted&type=email');
        await page.getByRole('heading', { name: 'Confirm sign-in', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.__confirmationDatabaseOpens), 0);
        assert.equal(await page.evaluate(async () => (await navigator.locks.query()).held.some(lock => lock.name?.endsWith('-writer'))), false);
      }
      await context.close();
    }
    console.log(`PASS ${app}: MacBook Air and iPhone 14 Pro${app === 'soundglow' ? '' : ', with isolated email confirmation'}`);
  } catch (error) { await captureFailure(browser, error); throw error; }
  finally { await closeBrowser(browser); }
}
module.exports = { smokeBrowser };
