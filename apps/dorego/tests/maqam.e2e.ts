import assert from 'node:assert/strict';
import { newPage } from '../../../scripts/ci/browser-harness.cjs';
import type { Browser } from 'playwright';
import { DEFAULT_SPEC } from '../src/music';
import { openPracticeOptions, selectExercise } from './ui-helpers';

export async function verifyMaqamScales(browser: Browser, base: string) {
  for (const width of [1440, 390]) {
    const page = await newPage(browser, { viewport: { width, height: 1000 }, hasTouch: true });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((spec) => {
      if (!localStorage.getItem('dorego.current'))
        localStorage.setItem(
          'dorego.current',
          JSON.stringify({
            ...spec,
            pattern: 'maqamat',
            low: 60,
            high: 72,
            repetitions: 1,
            countIn: 0,
            bpm: 60,
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
    await selectExercise(page, 'maqamat');
    if (width >= 768) {
      const choices = await page.locator('[data-pattern]').allTextContents();
      assert.equal(choices.indexOf('Maqamat'), choices.indexOf('Glides') + 1);
    }
    assert.equal(
      await page.getByRole('group', { name: 'Maqamat controls', exact: true }).isVisible(),
      true
    );
    assert.equal(await page.locator('.practice-panel #scale-tuning').count(), 1);
    assert.equal(await page.locator('#scale-tuning').inputValue(), 'Hijaz');
    await page.locator('#scale-tuning').click();
    assert.deepEqual(await page.getByRole('listbox').getByRole('option').allTextContents(), [
      'Hijaz',
      'Rast',
      'Bayati',
      'Ajam',
      'Nahawand',
      'Kurd',
      'Nikriz',
    ]);
    const inputBounds = await page.locator('#scale-tuning').boundingBox();
    const dropdownBounds = await page.getByRole('listbox').boundingBox();
    assert.ok(dropdownBounds!.y >= inputBounds!.y + inputBounds!.height - 1);
    await page.getByRole('option', { name: 'Rast', exact: true }).click();
    assert.equal(await page.locator('#tonic-drone').isChecked(), false);
    await page.locator('#tonic-drone').check();
    await page.reload();
    await page.locator('#play:enabled').waitFor();
    assert.equal(await page.locator('#scale-tuning').inputValue(), 'Rast');
    assert.equal(await page.locator('#tonic-drone').isChecked(), true);
    await page.locator('#play').click();
    await page.waitForFunction(
      () =>
        (window as any).sampleRates.some(
          (r: number) => Math.abs(12 * Math.log2(r) - Math.round(12 * Math.log2(r))) > 0.4
        ),
      { timeout: 30000 }
    );
    await page.evaluate(() => document.fonts.load('16px DoReGoAccidentals', '𝄲𝄳'));
    const marker = page.locator('.note-pad[data-quarter-tone].is-playing');
    await marker.waitFor();
    assert.match((await marker.textContent())!, /[𝄳𝄲]/u);
    assert.ok(!(await marker.textContent())!.includes('¢'));
    await page.screenshot({ path: `/tmp/dorego-maqam-${width}.png`, fullPage: true });
    const before = await page.locator('.dorego-piano').boundingBox();
    await page.locator('#play').click();
    await marker.waitFor({ state: 'hidden' });
    const after = await page.locator('.dorego-piano').boundingBox();
    assert.equal(after!.y, before!.y, 'Fractional labels do not move the keyboard');
    assert.equal(await page.locator('#exercise-title').textContent(), 'Maqamat');
    const played = await page.evaluate(() => (window as any).sampleRates.length);
    await page.locator('[data-piano="63.5"]').tap();
    await page.waitForFunction((count) => (window as any).sampleRates.length > count, played);
    assert.equal(
      await page
        .locator('[data-piano="63.5"]')
        .evaluate((pad) => getComputedStyle(pad).outlineStyle),
      'none'
    );
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('dorego.current')!);
      localStorage.setItem(
        'dorego.current',
        JSON.stringify({ ...saved, low: 60, high: 74, progression: 'down', repetitions: 1 })
      );
    });
    await page.goto(base);
    await page.locator('#play:enabled').waitFor();
    assert.match((await page.locator('#exercise-summary').textContent())!, /Round 1 of 3/);
    assert.equal(await page.locator('.note-pad').count(), 8);
    assert.equal(await page.locator('.note-pad').first().getAttribute('data-piano'), '62');
    const symbolSize = await page
      .locator('[data-piano="65.5"] .pitch-accidental')
      .evaluate((el) => ({
        symbol: parseFloat(getComputedStyle(el).fontSize),
        letter: parseFloat(getComputedStyle(el.parentElement!).fontSize),
      }));
    assert.ok(
      symbolSize.symbol >= symbolSize.letter * 0.9,
      'Quarter-tone symbols must not be tiny superscripts'
    );
    await page.screenshot({ path: `/tmp/dorego-half-sharp-${width}.png`, fullPage: true });
    await page.locator('#next-round').click();
    assert.equal(await page.locator('.note-pad').first().getAttribute('data-piano'), '61');
    await selectExercise(page, 'fiveNote');
    await openPracticeOptions(page);
    assert.equal(await page.locator('#scale-tuning').count(), 0);
    assert.equal(await page.locator('#tonic-drone').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Maqam UI and fractional sample playback passed at ${width}px`);
  }
}
