// Real-browser regression for the startup races that fake locator tests miss.
import assert from "node:assert/strict";
import { launchBrowser, newPage, closeBrowser, captureFailure, waitForAccountIdle, waitForDialogClosed } from "../../scripts/ci/browser-harness.cjs";
import { gotoHymn, reloadHymn, openHymnControls } from "../../packages/music-practice/browser-tests/helpers";
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
  await page.route('http://readiness.test/**', route => route.fulfill({contentType:'text/html',body:`<div id="loading">Opening saved practice…</div><script>
    window.__soundtoolsStartup={ready:false}; window.order=[];
    setTimeout(()=>{window.__soundtoolsStartup.ready=true;window.order.push('startup')},25);
    setTimeout(()=>{document.body.innerHTML='<div class="hymn-controls hymn-toolbar-mobile">Controls</div><h1 class="sequence-title">Fixture</h1><div id="saved">Saved on this device.</div><input type="number" id="volume" value="37"><input type="number" id="verification-code" value="123456"><input type="password" id="password" value="private-password"><div class="hymn-paper"></div>';window.order.push('restored')},50);
    setTimeout(()=>{document.querySelector('.hymn-paper').innerHTML='<svg width="20" height="20"><circle cx="10" cy="10" r="5"/></svg>';window.order.push('score')},75);
  </script>`}));
  await gotoHymn(page,'http://readiness.test/piano/hymns/fixture');
  assert.deepEqual(await page.evaluate(()=>(window as any).order),['startup','restored','score']);
  assert.equal(await page.locator('#volume').inputValue(),'37');
  const {failurePageState}=await import("../../scripts/ci/failure-state.cjs");
  const snapshot=await page.evaluate(failurePageState);
  assert.equal(snapshot.controls[0].value,'37');
  assert(!JSON.stringify(snapshot).includes('private-password'));
  assert(!JSON.stringify(snapshot).includes('123456'));
  await reloadHymn(page);
  assert.deepEqual(await page.evaluate(()=>(window as any).order),['startup','restored','score']);
  console.log('PASS: delayed mobile startup, idempotent controls, account restoration and dialog completion');
} catch (error) { await captureFailure(browser, error); throw error; }
finally { await closeBrowser(browser); }
