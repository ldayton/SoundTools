import type { Page } from 'playwright';
import { parseNote } from '../src/note-spelling';
/** Observe pitch fields and committed scalar settings without hidden form mirrors. */
export async function readSpecValue(page: Page, key: string) {
  if (key === 'low' || key === 'high')
    return String(parseNote(await page.locator(`#${key}-spin`).inputValue()));
  return page.evaluate(
    (key) => String(JSON.parse(localStorage.getItem('dorego.current') || '{}')[key]),
    key
  );
}
export async function openMoreOptions(page: Page) {
  await openPracticeOptions(page);
  const toggle = page.getByRole('button', { name: 'More options', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.locator('#countIn').waitFor();
}
/** Sliders expose their state through ARIA instead of hidden range-input mirrors. */
export async function sliderValue(page: Page, id: string) {
  return (await page.locator(`#${id}`).getAttribute('aria-valuenow'))!;
}
export async function setSlider(page: Page, id: string, target: number) {
  const slider = page.locator(`#${id}`);
  const min = Number(await slider.getAttribute('aria-valuemin'));
  const max = Number(await slider.getAttribute('aria-valuemax'));
  const step = id === 'position' ? 0.01 : id === 'tempo-slider' ? 5 : 1;
  const fromEnd = target - min > max - target;
  await slider.press(fromEnd ? 'End' : 'Home');
  const count = Math.round((fromEnd ? max - target : target - min) / step);
  for (let i = 0; i < count; i++) await slider.press(fromEnd ? 'ArrowLeft' : 'ArrowRight');
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
  const link = page.getByRole('link', { name: 'Warm-up', exact: true });
  if (await page.evaluate(() => matchMedia('(min-width:48em)').matches)) await link.waitFor();
  else if (!(await link.isVisible()))
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await link.click();
  await page.locator('#play').waitFor();
}
