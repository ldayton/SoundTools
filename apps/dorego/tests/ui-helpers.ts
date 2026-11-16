import type { Page } from 'playwright';
import { parseNote } from '../src/note-spelling';
/** Observe pitch fields and committed scalar settings without hidden form mirrors. */
export async function readSpecValue(page: Page, key: string) {
  if (key === 'low' || key === 'high')
    return String(parseNote(await page.locator(`#${key}-spin`).inputValue()));
  if (key === 'pattern')
    return page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('dorego.current') || '{}').pattern ||
        document.querySelector('[data-pattern][aria-current]')?.getAttribute('data-pattern')
    );
  return page.evaluate(
    (key) => String(JSON.parse(localStorage.getItem('dorego.current') || '{}')[key]),
    key
  );
}
export async function openMoreOptions(page: Page) {
  await openPracticeOptions(page);
  await page.locator('#countIn').waitFor();
}
/** Sliders expose their state through ARIA instead of hidden range-input mirrors. */
export async function sliderValue(page: Page, id: string) {
  const popup = id === 'volume' && !(await page.locator('#volume').isVisible());
  if (popup) await page.getByRole('button', { name: 'Volume', exact: true }).click();
  const value = (await page.locator(`#${id}`).getAttribute('aria-valuenow'))!;
  if (popup) await page.keyboard.press('Escape');
  return value;
}
export async function setSlider(page: Page, id: string, target: number) {
  if (id === 'volume') {
    if (!(await page.locator('#volume').isVisible()))
      await page.getByRole('button', { name: 'Volume', exact: true }).click();
  }
  const slider = page.locator(`#${id}`);
  const min = Number(await slider.getAttribute('aria-valuemin'));
  const max = Number(await slider.getAttribute('aria-valuemax'));
  const step = 1;
  const fromEnd = target - min > max - target;
  await slider.press(fromEnd ? 'End' : 'Home');
  const count = Math.round((fromEnd ? max - target : target - min) / step);
  for (let i = 0; i < count; i++) await slider.press(fromEnd ? 'ArrowLeft' : 'ArrowRight');
  if (id === 'volume') await page.keyboard.press('Escape');
}

export async function openPracticeOptions(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('.practice-options')?.dataset.layout ===
      (matchMedia('(min-width:70em)').matches ? 'desktop' : 'mobile')
  );
  const expand = page.getByRole('button', { name: 'Expand practice options', exact: true });
  if (await expand.isVisible()) await expand.click();
  await page.locator('#practice-options-content').waitFor();
}
export async function openSettings(page: Page) {
  const link = page.getByRole('link', { name: 'Settings', exact: true });
  if (await page.evaluate(() => matchMedia('(min-width:48em)').matches)) await link.waitFor();
  else if (!(await link.isVisible()))
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await link.click();
  await page.getByRole('region', { name: 'App settings', exact: true }).waitFor();
}
export async function openPractice(page: Page) {
  const link = page.getByRole('link', { name: 'DoReGo home', exact: true });
  if (await page.evaluate(() => matchMedia('(min-width:48em)').matches)) await link.waitFor();
  else if (!(await link.isVisible()))
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await link.click();
  await page.locator('#play').waitFor();
}

export async function selectExercise(page: Page, pattern: string) {
  await page.waitForFunction(
    () =>
      matchMedia('(min-width:48em)').matches ===
      !!document.querySelector('.mantine-AppShell-navbar')
  );
  if (await page.evaluate(() => matchMedia('(min-width:48em)').matches))
    await page.locator('.mantine-Drawer-content:visible').waitFor({ state: 'hidden' });
  else {
    const close = page.getByRole('button', { name: 'Close practice options', exact: true });
    if ((await page.locator('#practice-options-reopen').getAttribute('aria-expanded')) === 'true')
      await close.click();
  }
  const pentatonic = /^pentatonic(6|9|12)$/.test(pattern);
  const option = page
    .locator(`[data-pattern="${pentatonic ? 'pentatonic6' : pattern}"]`)
    .filter({ visible: true });
  if (!(await option.count())) {
    const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  await option.click();
  if (pentatonic) {
    await openPracticeOptions(page);
    await page.locator('#pentatonic-notes').selectOption(pattern.replace('pentatonic', ''));
  }
}

export async function elapsedSeconds(page: Page) {
  return Number(await page.locator('#elapsed').getAttribute('data-seconds'));
}
export async function setTempo(page: Page, bpm: number) {
  await page.locator('#bpm').fill(String(bpm));
  await page.locator('#bpm').press('Tab');
}
/** Reach an observation point through the real transport; the UI no longer has seeking. */
export async function playUntil(page: Page, seconds: number) {
  if ((await elapsedSeconds(page)) >= seconds) await page.locator('#restart').click();
  await page.locator('#play:enabled').waitFor();
  if ((await page.locator('#play').getAttribute('data-mode')) !== 'playing')
    await page.locator('#play').click();
  await page.waitForFunction(
    (seconds) =>
      Number(document.querySelector('#elapsed')?.getAttribute('data-seconds')) >= seconds,
    seconds,
    { polling: 10, timeout: 60000 }
  );
  await page.locator('#play').click();
}
