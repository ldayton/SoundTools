// Real-browser regression for the startup races that fake locator tests miss.
import assert from "node:assert/strict";
import { launchBrowser, newPage, closeBrowser, captureFailure, waitForAccountIdle, waitForDialogClosed } from "../../scripts/ci/browser-harness.cjs";
import { openHymnControls } from "../../packages/music-practice/browser-tests/helpers";
const browser = await launchBrowser();
try {
  const page = await newPage(browser, { viewport: { width: 390, height: 844 } });
  await page.setContent('<div>Loading</div>');
  await page.evaluate(() => {
    (window as any).__soundtoolsStartup = { ready: false };
    setTimeout(() => {
      document.body.innerHTML = `<div class="hymn-controls hymn-toolbar-mobile">Playback</div><div class="practice-options" data-layout="mobile"><button id="practice-options-reopen" aria-label="Expand playback options" aria-expanded="false">Options</button><div id="practice-options-content" hidden>Ready</div></div>`;
      document.querySelector('button')!.onclick = () => {
        document.getElementById('practice-options-content')!.hidden = false;
        document.querySelector('button')!.setAttribute('aria-expanded', 'true');
      };
      (window as any).__soundtoolsStartup.ready = true;
    }, 100);
  });
  // Called before the toolbar exists: the helper must wait, then open it.
  await openHymnControls(page);
  assert.equal(await page.locator('#practice-options-content').isVisible(), true);
  await openHymnControls(page); // idempotent; never close an already-open drawer
  assert.equal(await page.locator('#practice-options-content').isVisible(), true);
  await page.setContent(`<div data-account-status="restoring" data-account-pending="1"></div><dialog open id="closing">Closing</dialog>
    <script>setTimeout(()=>{const e=document.querySelector('[data-account-status]');e.dataset.accountStatus='synced';e.dataset.accountPending='0';document.querySelector('dialog').remove()},100)</script>`);
  await waitForAccountIdle(page);
  await waitForDialogClosed(page, '#closing');
  assert.equal(await page.locator('[data-account-pending]').getAttribute('data-account-pending'), '0');
  assert.equal(await page.locator('#closing').count(), 0);
  console.log('PASS: delayed mobile startup, idempotent controls, account restoration and dialog completion');
} catch (error) { await captureFailure(browser, error); throw error; }
finally { await closeBrowser(browser); }
