import assert from 'node:assert/strict';
import type { Browser } from 'playwright';
import { newPage } from '../../../scripts/ci/browser-harness.cjs';
import { DEFAULT_SPEC } from '../src/music';
import { selectExercise, openPracticeOptions } from './ui-helpers';
export async function verifyYemenite(browser: Browser, base: string) {
  for (const [width, height] of [
    [320, 568],
    [390, 667],
    [1440, 1050],
  ]) {
    const page = await newPage(browser, { viewport: { width, height }, hasTouch: true });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      (spec) => {
        if (!localStorage.getItem('dorego.current'))
          localStorage.setItem('dorego.current', JSON.stringify(spec));
        (window as any).rates = [];
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
          (window as any).rates.push(this.playbackRate.value);
          return start.apply(this, args);
        };
      },
      { ...DEFAULT_SPEC, pattern: 'yemenite', low: 60, high: 72, repetitions: 1, countIn: 0 }
    );
    await page.goto(base);
    await page.locator('#play:enabled').waitFor();
    await selectExercise(page, 'yemenite');
    assert.equal(await page.locator('#exercise-title').textContent(), 'Yemenite ✡︎');
    const choose = async (id: string, label: string) => {
      await page.locator(`#${id}`).click();
      await page.getByRole('listbox').getByRole('option', { name: label, exact: true }).click();
    };
    const pitches = () =>
      page
        .locator('.note-pad')
        .evaluateAll((pads) => pads.map((pad) => Number(pad.getAttribute('data-piano'))));
    const fits = async () => {
      const layout = await page.locator('.note-instrument').evaluate((section) => ({
        bottom: section.getBoundingClientRect().bottom,
        sectionWidth: section.getBoundingClientRect().width,
        gridWidth: section.querySelector('.dorego-note-pads')!.getBoundingClientRect().width,
        centerOffset:
          (section.getBoundingClientRect().left +
            section.getBoundingClientRect().right -
            section.closest('.practice-panel')!.getBoundingClientRect().left -
            section.closest('.practice-panel')!.getBoundingClientRect().right) /
          2,
        page: document.documentElement.scrollHeight,
        height: innerHeight,
        pads: [...section.querySelectorAll('.note-pad')].map((pad) => {
          const b = pad.getBoundingClientRect();
          return [b.width, b.height];
        }),
      }));
      assert.ok(
        layout.page <= layout.height + 1 && layout.bottom <= layout.height + 1,
        `Yemenite ${width}: one-screen fit`
      );
      if (width >= 768) {
        assert.ok(
          Math.abs(layout.sectionWidth - layout.gridWidth - 28) < 1,
          'Instrument background hugs the keys'
        );
        assert.ok(Math.abs(layout.centerOffset) < 1, 'Instrument is centered');
        assert.ok(
          layout.pads.every(([w]) => w <= 120.5),
          'Desktop pad width cap'
        );
      }
      assert.ok(
        layout.pads.every(([w, h]) => w >= 44 && h >= 44),
        'Finger-sized targets'
      );
    };
    assert.equal(await page.locator('#yemenite-family').inputValue(), 'Bayati');
    assert.equal(await page.locator('#yemenite-extent').inputValue(), '8');
    assert.deepEqual(await pitches(), [60, 61.5, 63, 65, 67, 68, 70, 72]);
    await fits();
    await choose('yemenite-family', 'Rast');
    await choose('yemenite-extent', '5');
    assert.equal(await page.locator('#yemenite-extent').inputValue(), '5');
    assert.deepEqual(await pitches(), [60, 62, 63.5, 65, 67]);
    assert.equal(await page.locator('[data-piano="63.5"]').getAttribute('aria-label'), 'E𝄳4');
    await fits();
    await choose('yemenite-extent', '4');
    assert.deepEqual(await pitches(), [60, 62, 63.5, 65]);
    await choose('yemenite-family', 'Bayati');
    assert.deepEqual(await pitches(), [60, 61.5, 63, 65]);
    await choose('yemenite-extent', '8');
    assert.deepEqual(await pitches(), [60, 61.5, 63, 65, 67, 68, 70, 72]);
    await fits();
    await choose('yemenite-family', 'Sikah');
    assert.equal(await page.locator('#yemenite-extent').inputValue(), '3');
    assert.equal(await page.locator('#yemenite-extent').isDisabled(), true);
    assert.deepEqual(await pitches(), [60, 61.5, 63.5]);
    await page.locator('#tonic-drone').check();
    await page.reload();
    await page.locator('#play:enabled').waitFor();
    assert.equal(await page.locator('#yemenite-family').inputValue(), 'Sikah');
    assert.equal(await page.locator('#tonic-drone').isChecked(), true);
    assert.deepEqual(await pitches(), [60, 61.5, 63.5]);
    await fits();
    const rangeFont = await page
      .locator('.practice-pitch-range')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    assert.match(rangeFont, /DoReGoAccidentals/);
    await page.evaluate(() => document.fonts.load('11px DoReGoAccidentals', '𝄳𝄲'));
    await page.locator('[data-piano="61.5"]').tap();
    await page.waitForFunction(() =>
      (window as any).rates.some(
        (rate: number) => Math.abs(12 * Math.log2(rate) - Math.round(12 * Math.log2(rate))) > 0.4
      )
    );
    await page.locator('#play').click();
    await page.locator('.note-pad.is-playing').first().waitFor();
    await page.locator('#play').click();
    await page.screenshot({ path: `/tmp/dorego-yemenite-${width}.png`, fullPage: true });
    await openPracticeOptions(page);
    assert.equal(await page.locator('#startingChords').isVisible(), false);
    assert.equal(await page.locator('#note-range').isVisible(), true);
    assert.equal(await page.locator('#direction-both').isVisible(), true);
    if (width === 390) {
      await page.evaluate((spec) => localStorage.setItem('dorego.current', JSON.stringify(spec)), {
        ...DEFAULT_SPEC,
        pattern: 'yemenite',
        yemeniteCollection: 'sikah-trichord',
        low: 60,
        high: 65,
        progression: 'up',
        bpm: 240,
        countIn: 0,
        restBeats: 16,
        repetitions: 1,
      });
      await page.reload();
      await page.locator('#play:enabled').waitFor();
      await page.locator('#play').click();
      await page.waitForFunction(
        () => document.querySelector('.round-count')?.textContent === '10'
      );
      const before = await page.locator('.practice-status-label').boundingBox();
      const countBefore = await page.locator('.round-count').boundingBox();
      await page.waitForFunction(() => document.querySelector('.round-count')?.textContent === '9');
      const after = await page.locator('.practice-status-label').boundingBox();
      const countAfter = await page.locator('.round-count').boundingBox();
      assert.equal(after!.x, before!.x, 'Countdown prefix must not shift at 10 to 9');
      assert.equal(countAfter!.width, countBefore!.width, 'Countdown reserves a fixed digit slot');
      assert.equal(countAfter!.x, countBefore!.x);
      await page.locator('#play').click();
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `Yemenite ${width}px: authored extents, notation, persistence, touch audio and one-screen layout passed`
    );
  }
}
