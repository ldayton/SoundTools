import { waitForServer, captureFailure, closeBrowser, launchBrowser, newPage } from '../../../scripts/ci/browser-harness.cjs';
import { openSettings, openPractice } from './ui-helpers';
import { createRequire } from 'node:module';
const viteCli = createRequire(import.meta.url)
  .resolve('vite/package.json')
  .replace(/package\.json$/, 'bin/vite.js');
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn(
  process.execPath,
  [
    viteCli,
    'preview',
    '--mode',
    'pages',
    '--outDir',
    'dist-pages',
    '--host',
    '127.0.0.1',
    '--port',
    '4981',
    '--strictPort',
  ],
  { stdio: 'pipe' }
);
let browser;
try {
  const url = 'http://127.0.0.1:4981/DoReGo/';
  await waitForServer(url, { server });
  browser = await launchBrowser();
  const page = await newPage(browser, { acceptDownloads: true }),
    remote: string[] = [];
  page.on('request', (r) => {
    if (/sentry\.io/.test(r.url())) remote.push(r.url());
  });
  await page.goto(url);
  await openSettings(page);
  await page.locator('#share-diagnostics').waitFor();
  const sharing = page.getByRole('checkbox', { name: 'Share diagnostic information', exact: true });
  assert.equal(await sharing.isChecked(), false);
  assert.equal(
    await page.locator('#share-diagnostics').locator('..').locator('button, summary').count(),
    0
  );
  await page.evaluate(() => window.doregoDiagnostics!.capture(Error('PRIVATE'), 'before.opt_in'));
  assert.equal(
    await page.evaluate(() => (window.doregoDiagnostics!.snapshot().errors as any[]).length),
    0
  );
  await page.evaluate(() => {
    const client = window.doregoDiagnostics!;
    (window as any).originalSharing = client.setSharing;
    client.setSharing = async () => {
      throw Error('simulated unavailable consent storage');
    };
  });
  await sharing.click();
  await page
    .getByText('Couldn’t change diagnostic sharing. Please retry.', { exact: true })
    .waitFor();
  assert.equal(
    await sharing.isChecked(),
    false,
    'Failed consent changes do not show sharing as enabled'
  );
  assert.ok(
    await sharing.getAttribute('aria-describedby'),
    'Consent failure is associated with its checkbox'
  );
  await page.evaluate(() => {
    window.doregoDiagnostics!.setSharing = (window as any).originalSharing;
  });
  await sharing.check();
  await page.evaluate(() => {
    window.doregoDiagnostics!.capture(new Error('PRIVATE exercise title'), 'samples.test_failed');
    window.doregoDiagnostics!.metric('samples.prepare_ms', 123);
  });
  const report = await page.evaluate(() => window.doregoDiagnostics!.snapshot());
  assert.equal(report.app, 'dorego');
  assert.equal((report.errors as any[])[0].code, 'samples.test_failed');
  assert(!JSON.stringify(report).includes('PRIVATE'));
  await page.evaluate(() => window.doregoDiagnostics!.capture(Error('PRIVATE'), 'playback.start_failed', {
    audioState:'interrupted', audioFailure:'resume_timeout', audioRecovery:'needed', clockAdvanced:false,
    deviceLabel:'PRIVATE', audioFailureUrl:'PRIVATE',
  }));
  const failure=await page.evaluate(() => (window.doregoDiagnostics!.snapshot().errors as any[]).find(e=>e.code==='playback.start_failed'));
  assert.equal(failure.details.audioFailure,'resume_timeout');
  assert.equal(failure.details.audioRecovery,'needed');
  assert.equal(failure.details.audioState,'interrupted');
  assert.equal(failure.details.clockAdvanced,false);
  assert(!JSON.stringify(failure).includes('PRIVATE'));

  assert.deepEqual(remote, []);
  await page.reload();
  await sharing.waitFor();
  assert.equal(await sharing.isChecked(), true);
  await sharing.uncheck();
  await page.reload();
  await sharing.waitFor();
  assert.equal(await sharing.isChecked(), false);
  await sharing.check();
  await openPractice(page);
  await page.waitForFunction(
    () => document.querySelector<HTMLButtonElement>('#play')?.disabled === false
  );
  await page.locator('#play').click();
  await page.waitForFunction(() => {
    const report=window.doregoDiagnostics!.snapshot() as any;
    return report.metrics['audio.startup_check_ms']?.count > 0 && report.context.mode !== 'starting';
  });
  const startup=await page.evaluate(() => window.doregoDiagnostics!.snapshot());
  assert.equal((startup.context as any).mode, 'playing', JSON.stringify(startup));
  await page.waitForFunction(
    () =>
      ((window.doregoDiagnostics!.snapshot().metrics as any)?.['render.interval_ms']?.count || 0) >
      5
  );
  await page.locator('#play').click();
  const count = await page.evaluate(
    () => (window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count
  );
  await page.waitForTimeout(300);
  await page.locator('#play').click();
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(
      () => (window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count
    ),
    count,
    'Resume must not count idle time or warmup frames'
  );
  await page.waitForFunction(
    (n) =>
      (window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count > n + 5,
    count
  );
  console.log('DoReGo diagnostic opt-in/privacy and pause/resume timing passed');
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
