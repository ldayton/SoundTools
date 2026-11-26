import assert from 'node:assert/strict';
import type { Browser } from 'playwright';
import { createContext, waitForApp } from '../../../scripts/ci/browser-harness.cjs';
import { DEFAULT_SPEC } from '../src/music';
import { openPracticeOptions } from './ui-helpers';
export async function verifyVoiceFeedback(browser: Browser, base: string) {
  const context = await createContext(browser, {
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  await context.addInitScript(
    (spec) => {
      localStorage.setItem('dorego.current', JSON.stringify(spec));
      localStorage.setItem('dorego.glideShapeVersion', '1');
    },
    {
      ...DEFAULT_SPEC,
      pattern: 'fiveNote',
      low: 60,
      high: 67,
      bpm: 60,
      countIn: 0,
      startingChords: false,
      repetitions: 1,
    }
  );
  await context.addInitScript({
    path: new URL('./voice-microphone-fixture.js', import.meta.url).pathname,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await waitForApp(page, '#play');
  await page.locator('#play:enabled').waitFor();
  assert.deepEqual(errors, [], 'Microphone fixture and application initialize cleanly');
  assert.ok(
    await page.evaluate(() => Object.hasOwn(navigator.mediaDevices, 'getUserMedia')),
    'Generated microphone fixture is installed'
  );
  assert.equal(await page.locator('.voice-ribbon').count(), 0);
  assert.equal(await page.evaluate(() => (window as any).voiceProbe.calls), 0);
  await openPracticeOptions(page);
  await page.locator('#voice-feedback').check();
  await page.keyboard.press('Escape');
  await page.locator('#practice-options-content').waitFor({ state: 'hidden' });
  await page.locator('.voice-ribbon').waitFor();
  assert.equal(await page.evaluate(() => (window as any).voiceProbe.calls), 0);
  await page.locator('#play').click();
  await page.waitForFunction(() =>
    (document.querySelector('.voice-ribbon-voice')?.getAttribute('d') || '').includes('L')
  );
  assert.equal(await page.evaluate(() => (window as any).voiceProbe.calls), 1);
  assert.equal(await page.locator('.voice-ribbon figcaption').innerText(), 'Guide\nYour voice');
  assert.ok(
    await page
      .locator('.voice-ribbon')
      .evaluate((e) => e.getBoundingClientRect().right <= innerWidth)
  );
  await page.screenshot({ path: 'work/voice-ribbon-phone.png' });
  await page.locator('#play').click();
  await page.waitForFunction(() =>
    (window as any).voiceProbe.tracks.every((t: MediaStreamTrack) => t.readyState === 'ended')
  );
  await page.reload();
  await waitForApp(page, '#play');
  await page.locator('.voice-ribbon').waitFor();
  assert.equal(
    await page.evaluate(() => (window as any).voiceProbe.calls),
    0,
    'Restored opt-in does not capture while paused'
  );
  await openPracticeOptions(page);
  await page.locator('#voice-feedback').uncheck();
  assert.equal(await page.locator('.voice-ribbon').count(), 0);
  await page.locator('#voice-feedback').check();
  await page.evaluate(() => {
    (window as any).voiceProbe.deny = true;
  });
  await page.keyboard.press('Escape');
  await page.locator('#practice-options-content').waitFor({ state: 'hidden' });
  await page.locator('#play').click();
  await openPracticeOptions(page);
  await page.getByRole('alert').filter({ hasText: 'Microphone access was denied' }).waitFor();
  await page.locator('#voice-feedback').uncheck();
  await page.evaluate(() => {
    const p = (window as any).voiceProbe;
    p.deny = false;
    p.hold = true;
  });
  await page.locator('#voice-feedback').check();
  await page.waitForFunction(() => !!(window as any).voiceProbe.release);
  await page.locator('#voice-feedback').uncheck();
  await page.evaluate(() => (window as any).voiceProbe.release());
  await page.waitForFunction(() =>
    (window as any).voiceProbe.tracks.every((t: MediaStreamTrack) => t.readyState === 'ended')
  );
  assert.equal(
    await page.locator('.voice-ribbon').count(),
    0,
    'Late permission result cannot revive disabled feedback'
  );
  assert.deepEqual(errors, []);
  await context.close();
}
