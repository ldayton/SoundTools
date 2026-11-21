import assert from 'node:assert/strict';
import type { Browser } from 'playwright';
import { createContext } from '../../../scripts/ci/browser-harness.cjs';
import { openSettings, openPractice, selectExercise } from './ui-helpers';
export async function verifyExerciseUrls(browser: Browser, base: string) {
  const context = await createContext(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(base + 'maqamat/bayati?low=C4&high=D5');
    await page.locator('#play:enabled').waitFor();
    assert.equal(await page.locator('#exercise-title').textContent(), 'Maqamat');
    assert.equal(await page.locator('#low-spin').inputValue(), 'C4');
    assert.equal(await page.locator('#high-spin').inputValue(), 'D5');
    await page.locator('#low-spin').click();
    await page
      .getByRole('dialog', { name: 'Choose lowest note' })
      .locator('button[data-value="61"]')
      .click();
    await page.getByRole('dialog', { name: 'Choose lowest note' }).waitFor({ state: 'hidden' });
    await page.waitForURL('**/maqamat/bayati?low=C%234&high=D5');
    await page.goBack();
    await page.waitForFunction(
      () => document.querySelector<HTMLInputElement>('#low-spin')?.value === 'C4'
    );
    await page.locator('#scale-tuning').click();
    await page.getByRole('option', { name: 'Hijaz', exact: true }).click();
    await page.waitForURL('**/maqamat/hijaz?low=C4&high=D5');
    await page.goBack();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('dorego.current')!).scaleTuning === 'bayati'
    );
    await page.goForward();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('dorego.current')!).scaleTuning === 'hijaz'
    );
    await openSettings(page);
    await openPractice(page);
    assert.match(page.url(), /\/maqamat\/hijaz\?low=C4&high=D5$/);
    await page.reload();
    await page.locator('#play:enabled').waitFor();
    assert.equal(await page.locator('#low-spin').inputValue(), 'C4');
    await selectExercise(page, 'fiveNote');
    await page.waitForURL('**/major/5?*');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + 'yemenite');
    await page.locator('#play:enabled').waitFor();
    await page.waitForURL('**/yemenite/bayati/8');
    assert.equal(await page.locator('.note-pad').count(), 8);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
