import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { launchBrowser, createOfflineContext, captureFailure, closeBrowser, waitForApp } from '../../../scripts/ci/browser-harness.cjs';
import { waitForOfflineReady } from '../../../packages/music-practice/browser-tests/helpers';

// Real elapsed-time witness. The reviewed resource declaration owns all runner
// capacity, so unrelated rendering/DSP cannot consume this startup budget.
let slowNavigation = false;
let announceStall: (() => void) | undefined;
const mime: Record<string,string> = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
const server = createServer(async (req,res) => {
  const pathname = new URL(req.url!, 'http://localhost').pathname;
  const file = pathname === '/' || pathname === '/settings' || /^\/(piano|guitar|theory)(\/[a-z0-9-]+)*\/?$/.test(pathname) ? 'index.html' : pathname.slice(1);
  if (slowNavigation && file === 'index.html') {
    announceStall?.();
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  try {
    const bytes = await readFile(resolve('dist',file));
    res.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(bytes);
  } catch { res.writeHead(404);res.end(); }
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${(server.address() as {port:number}).port}/`;
const browser = await launchBrowser();
let networkProbe: Promise<void> | undefined;
try {
  const context = await createOfflineContext(browser);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await waitForApp(page,'[data-letter="E"]:enabled');
  await waitForOfflineReady(page);
  assert(await page.evaluate(()=>!!navigator.serviceWorker.controller), 'The complete cached copy controls the page');

  slowNavigation = true;
  const stalled = new Promise<void>(resolve=>{announceStall=resolve;});
  let networkFinished = false;
  // Positive control: a real request to the same HTML endpoint is still stalled
  // when the cached browser becomes usable. No browser request is intercepted.
  networkProbe = fetch(base).then(response=>response.arrayBuffer()).then(()=>{networkFinished=true;});
  await stalled;
  const start = performance.now();
  await page.goto(base);
  await waitForApp(page,'[data-letter="E"]:enabled');
  const elapsed = performance.now()-start;
  assert(elapsed<4500, `Cached startup must beat a 5-second network stall (${Math.round(elapsed)}ms)`);
  assert.equal(networkFinished,false,'The real network response must still be stalled');
  assert.deepEqual(errors,[]);
  slowNavigation = false;
  await networkProbe;
  console.log(`PASS cached startup in ${Math.round(elapsed)}ms before the stalled network response`);
} catch (error) { await captureFailure(browser,error);throw error; }
finally {
  slowNavigation = false;
  await closeBrowser(browser);
  server.closeAllConnections();
  await networkProbe?.catch(()=>{});
  await new Promise<void>(resolve=>server.close(()=>resolve()));
}
