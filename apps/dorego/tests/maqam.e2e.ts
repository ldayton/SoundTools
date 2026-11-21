import assert from 'node:assert/strict';
import { newPage } from '../../../scripts/ci/browser-harness.cjs';
import type { Browser } from 'playwright';
import { DEFAULT_SPEC } from '../src/music';
import { openPracticeOptions, selectExercise } from './ui-helpers';

export async function verifyMaqamScales(browser: Browser, base: string) {
  for (const width of [1440, 390]) {
    const page = await newPage(browser, { viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((spec) => {
      if (!localStorage.getItem('dorego.current'))
        localStorage.setItem(
          'dorego.current',
          JSON.stringify({
            ...spec,
            pattern: 'fiveNote',
            low: 60,
            high: 67,
            repetitions: 1,
            countIn: 0,
            startingChords: false,
          })
        );
      const rates: number[] = [];
      (window as any).sampleRates = rates;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
        rates.push(this.playbackRate.value);
        return start.apply(this, args);
      };
    }, DEFAULT_SPEC);
    await page.goto(base);
    await page.locator('#play:enabled').waitFor();
    await selectExercise(page, 'fiveNote');
    await openPracticeOptions(page);
    await page.locator('#scale-tuning').selectOption('rast');
    assert.equal(await page.locator('#tonic-drone').isChecked(), false);
    await page.locator('#tonic-drone').check();
    await page.reload();
    await page.locator('#play:enabled').waitFor();
    await openPracticeOptions(page);
    assert.equal(await page.locator('#scale-tuning').inputValue(), 'rast');
    assert.equal(await page.locator('#tonic-drone').isChecked(), true);
    const close = page.getByRole('button', { name: 'Close practice options', exact: true });
    if (await close.isVisible()) await close.click();
    await page.locator('#play').click();
    await page.waitForFunction(
      () =>
        (window as any).sampleRates.some(
          (r: number) => Math.abs(12 * Math.log2(r) - Math.round(12 * Math.log2(r))) > 0.4
        ),
      { timeout: 30000 }
    );
    await page.getByText('Between piano keys:', { exact: false }).waitFor({ timeout: 30000 });
    await page.screenshot({ path: `/tmp/dorego-maqam-${width}.png`, fullPage: true });
    await page.locator('#play').click();
    await selectExercise(page, 'arpeggio');
    await openPracticeOptions(page);
    assert.equal(await page.locator('#scale-tuning').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Maqam UI and fractional sample playback passed at ${width}px`);
  }
}
