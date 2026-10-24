import type { Page } from 'playwright';
import { launchTestBrowser } from './browser-harness';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DEFAULT_SPEC, PATTERNS, vocalSpan, type Pattern } from '../src/music';

// Serve the actual Pages build. Faults occur at the server so they also affect workers.
const root = resolve('dist-pages');
const initialHTML = await readFile(resolve(root, 'index.html'), 'utf8');
const legacyWorker = process.env.LEGACY_WORKER_PATH
  ? await readFile(process.env.LEGACY_WORKER_PATH, 'utf8')
  : null;
const initialPack = JSON.parse(await readFile(resolve(root, 'offline-pack.json'), 'utf8'));
const originalMain = await readFile(resolve(root, initialHTML.match(/src="([^"]+\.js)"/)![1].slice('/DoReGo/'.length)), 'utf8');
const mainAsset = initialHTML.match(/src="([^"]+\.js)"/)![1];
let failInterface = false;
let failSounds = false;
let slowSounds = false;
let revision = 1;
let soundRequests = 0;
const server = createServer(async (request, response) => {
  const path = new URL(request.url!, 'http://localhost').pathname;
  if (!path.startsWith('/DoReGo/')) {
    response.writeHead(404).end();
    return;
  }
  if (path.endsWith('.flac')) {
    soundRequests++;
    if (slowSounds) await new Promise((resolve) => setTimeout(resolve, 80));
    if (failSounds) {
      response.writeHead(503).end('Simulated interruption');
      return;
    }
  }
  if (failInterface && path.includes('/assets/')) {
    response.writeHead(503).end();
    return;
  }
  const alias = path.match(/\/main-r(\d+)\.js$/);
  const actualPath = alias ? mainAsset : path;
  const file = resolve(root, actualPath.slice('/DoReGo/'.length) || 'index.html');
  if (!file.startsWith(root + '/')) {
    response.writeHead(403).end();
    return;
  }
  try {
    let body: Buffer | string =
      path.endsWith('sw.js') && revision === 1 && legacyWorker
        ? legacyWorker
        : await readFile(file);
    if (
      revision > 1 &&
      (path.endsWith('sw.js') || path.endsWith('offline-pack.json') || file.endsWith('index.html'))
    )
      body = body
        .toString()
        .replace(/dorego-shell-([a-f0-9]+)/g, `dorego-shell-$1-r${revision}`)
        .replaceAll(mainAsset, `/DoReGo/assets/main-r${revision}.js`);
    if (actualPath === mainAsset)
      body = `window.__testBuild = ${alias ? alias[1] : 1};\n` + body.toString();
    if (path.endsWith('offline-pack.json') || path.endsWith('sw.js')) {
      const main = revision > 1 ? `/DoReGo/assets/main-r${revision}.js` : mainAsset;
      const hashes = { ...initialPack.hashes };
      delete hashes[mainAsset];
      hashes['/DoReGo/'] = createHash('sha256').update(revision > 1 ? initialHTML.replaceAll(mainAsset, main) : initialHTML).digest('hex');
      hashes[main] = createHash('sha256').update(`window.__testBuild = ${revision};\n` + originalMain).digest('hex');
      if (path.endsWith('offline-pack.json')) {const pack=JSON.parse(body.toString());pack.hashes=hashes;body=JSON.stringify(pack);}
      else body=body.toString().replace(/^const CONFIG = (.*);$/m, (_line, raw) => {const config=JSON.parse(raw);config.hashes=hashes;return 'const CONFIG = '+JSON.stringify(config)+';';});
    }
    const type: Record<string, string> = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.webmanifest': 'application/manifest+json',
      '.flac': 'audio/flac',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };
    response.writeHead(200, {
      'Content-Type': type[extname(file)] || 'text/plain',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(4325, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:4325/DoReGo/';
const browser = await launchTestBrowser();
const context = await browser.newContext();
await context.addInitScript(() => { try { localStorage.setItem('dorego:diagnostics:sharing', 'yes'); } catch {} });
const errors: string[] = [];
let page = await context.newPage();
context.on('page', (p) => p.on('pageerror', (error) => errors.push(error.message)));
page.on('pageerror', (error) => errors.push(error.message));
const ready = async (p: Page) =>
  p.waitForFunction(() => document.querySelector<HTMLButtonElement>('#play')?.disabled === false);
const status = () => page.locator('#offline-status');
try {
  await page.goto(base);
  await ready(page);
  await page.locator('#offline-download').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>('#offline-download')?.disabled
  );
  assert.match(await status().innerText(), /Save all exercises/);

  // Cancellation preserves completed files and never claims offline readiness.
  slowSounds = true;
  await page.locator('#offline-download').click();
  await page.waitForFunction(
    () => Number(document.querySelector<HTMLProgressElement>('#offline-progress')?.value) > 0
  );
  await page.getByRole('button', { name: 'Cancel download' }).click();
  await page.getByRole('button', { name: 'Resume download' }).waitFor();
  assert.match(await status().innerText(), /paused/);
  assert.ok(await page.evaluate(() => (window.doregoDiagnostics!.snapshot().events as any[]).some(e => e.code === 'cache.download.paused' && e.details.cacheReason === 'cancelled')));

  // A failed download can resume without starting again from an empty cache.
  slowSounds = false;
  failSounds = true;
  await page.locator('#offline-download').click();
  await page.waitForFunction(() =>
    document.querySelector('#offline-status')?.textContent?.includes('incomplete')
  );
  failSounds = false;
  await page.locator('#offline-download').click();
  await page.waitForFunction(
    () => document.querySelector('#offline-status')?.textContent?.endsWith('Available offline'),
    { timeout: 30000 }
  );
  assert.ok(await page.evaluate(() => (window.doregoDiagnostics!.snapshot().events as any[]).some(e => e.code === 'cache.download.ready')));
  const count = await page.evaluate(async () => {
    const pack = await (await fetch('/DoReGo/offline-pack.json')).json();
    return (await (await caches.open(pack.cache)).keys()).length;
  });
  assert.equal(count, 133);
  assert.equal(await page.locator('#offline-download').isVisible(), false);
  assert.equal(await page.locator('.builder-column > .offline-section').count(), 1);
  assert.equal(await page.locator('#how-dialog .offline-section').count(), 0);
  const builder = (await page.locator('.settings').boundingBox())!;
  const offline = (await page.locator('.offline-section').boundingBox())!;
  assert.equal(offline.x, builder.x);
  assert.equal(offline.width, builder.width);
  assert.ok(offline.y >= builder.y + builder.height);
  console.log(
    'Cancel, interruption, resume, aligned builder panel, and all 133 recordings verified.'
  );

  // Activate while another tab is playing; refresh just one tab into a new JS generation.
  const other = await context.newPage();
  await other.goto(base);
  await ready(other);
  await page.locator('#play').click();
  // Observe replacement on the tab that stays alive; the reloaded tab gets a new global.
  await page.evaluate(() => {
    (window as any).__offlineReplaced = false;
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        (window as any).__offlineReplaced = true;
      },
      { once: true }
    );
  });
  revision = 2;
  assert.match(await page.locator('#play').innerText(), /Pause/);
  await other.reload();
  await ready(other);
  assert.equal(await other.evaluate(() => (window as any).__testBuild), 1, 'Cached startup opens immediately before checking for an update');
  await other.getByRole('button', {name:'Update available',exact:true}).waitFor();
  await other.getByRole('button', {name:'Update available',exact:true}).click();
  await ready(other);
  assert.equal(await other.evaluate(() => (window as any).__testBuild), 2);
  assert.equal(await page.evaluate(() => (window as any).__testBuild), 1);
  assert.match(await page.locator('#play').innerText(), /Pause/);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await page.waitForFunction(() => (window as any).__offlineReplaced);
  for (const tab of [page, other])
    await tab.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return (
        registration?.active?.state === 'activated' &&
        navigator.serviceWorker.controller === registration.active &&
        !registration.installing &&
        !registration.waiting
      );
    });

  const packs = await Promise.all(
    [page, other].map((p) =>
      p.evaluate(async () => (await (await fetch('/DoReGo/offline-pack.json')).json()).shellCache)
    )
  );
  assert.notEqual(
    packs[0],
    packs[1],
    'Each live document retains its own complete asset generation.'
  );
  const audioBefore = soundRequests;
  await other.getByRole('button', { name: 'Help', exact: true }).click();
  await other.getByRole('button', { name: 'Close how it works' }).click();
  assert.equal(soundRequests, audioBefore, 'An interface update must reuse saved recordings.');
  console.log(
    'New worker activates without interruption; one-tab refresh loads new JS while another keeps playing.'
  );

  // Broken deployment: a refresh must keep the complete saved version, never partial new HTML.
  failInterface = true;
  revision = 3;
  await other.reload();
  await ready(other);
  assert.equal(await other.evaluate(() => (window as any).__testBuild), 2);
  assert.match(await page.locator('#play').innerText(), /Pause/);
  failInterface = false;
  revision = 2;
  await page.locator('#play').click();
  await page.close();
  page = other;
  // Expire the grace period: only caches no longer used by live tabs may be removed.
  await page.evaluate(async () => {
    const meta = await caches.open('dorego-clients-v1');
    for (const request of await meta.keys()) {
      const record = await (await meta.match(request))!.json();
      await meta.put(request, new Response(JSON.stringify({ ...record, savedAt: 0 })));
    }
    const pack = await (await fetch('/DoReGo/offline-pack.json')).json();
    navigator.serviceWorker.controller!.postMessage({
      type: 'using-cache',
      shellCache: pack.shellCache,
      cache: pack.cache,
    });
  });
  assert.equal(await page.evaluate(async (name) => (await caches.keys()).includes(name), packs[0]), true, 'Keep one committed recovery copy');
  assert.equal(
    await page.evaluate(async (name) => (await caches.keys()).includes(name), packs[1]),
    true
  );
  console.log(
    'Incomplete update falls back safely; a committed recovery copy is retained without disturbing the current version.'
  );

  // Real disconnected reload, then uncached exercise configurations at both range extremes.
  await context.setOffline(true);
  await page.close();
  page = await context.newPage();
  await page.goto(base);
  await ready(page);
  const requestCount = soundRequests;
  for (const pattern of Object.keys(PATTERNS) as Pattern[]) {
    for (const highEnd of [false, true]) {
      const span = vocalSpan(pattern);
      const low = highEnd ? 96 - span : 24;
      await page.evaluate(
        (spec) => {
          localStorage.setItem('dorego.current', JSON.stringify(spec));
          localStorage.setItem('dorego.glideShapeVersion', '1');
        },
        {
          ...DEFAULT_SPEC,
          pattern,
          low,
          high: low + span,
          startingNote: highEnd ? 96 : 24,
          bpm: 60,
          repetitions: 1,
          restBeats: 0,
          countIn: 0,
          direction: 'down',
          progression: 'down',
        }
      );
      await page.reload();
      await page.waitForFunction(() => (window.doregoDiagnostics?.snapshot().events as any[] | undefined)?.some(e => e.code === 'cache.navigation.ready' && e.details.cacheSource === 'cache'));
      await ready(page);
      await page.locator('#play').click();
      await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
      await page.waitForFunction(
        () => Number(document.querySelector<HTMLInputElement>('#position')?.value) > 0
      );
      await page.locator('#play').click();
    }
  }
  assert.equal(soundRequests, requestCount, 'Offline exercises should never reach the server.');
  await page.waitForFunction(() =>
    document.querySelector('#offline-status')?.textContent?.endsWith('Available offline')
  );
  await page.screenshot({ path: 'work/offline-ready.png' });
  console.log('All seven exercises reopened and played offline at low/high extremes and 60 BPM.');

  // A missing recording must invalidate readiness, and repair must restore it.
  await page.evaluate(async () => {
    const pack = await (await fetch('/DoReGo/offline-pack.json')).json();
    await (await caches.open(pack.cache)).delete(pack.files[0].url);
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(
    () => document.querySelector('#offline-status')?.textContent?.startsWith('Save all exercises')
  );
  assert.equal(await page.locator('#offline-download').isDisabled(), false);
  await context.setOffline(false);
  // Firefox's emulated reconnect can omit `online` for a page opened offline.
  // Deliver the lifecycle signal explicitly; requests still use the real browser network.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.evaluate("Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false})");
  await page.locator('#offline-download').click();
  await page.waitForFunction(() => document.querySelector('#offline-status')?.textContent?.endsWith('Available offline'));
  assert.deepEqual(errors, []);
  console.log('Missing-file detection and repair passed; no uncaught page errors.');
} catch (error) {
  console.error('Offline failure state:', JSON.stringify(await page.evaluate(async () => {
    const pack=await(await fetch('/DoReGo/offline-pack.json')).json();
    const shell=await caches.open(pack.shellCache), sounds=await caches.open(pack.cache);
    return {status:document.querySelector('#offline-status')?.textContent, pack:pack.shellCache,
      missingShell:await Promise.all(pack.shell.map(async(url:string)=>(await shell.match(url))?null:url)),
      soundCount:(await sounds.keys()).length,diagnostics:window.doregoDiagnostics?.snapshot()};
  }).catch(()=>null),null,2));
  throw error;
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
