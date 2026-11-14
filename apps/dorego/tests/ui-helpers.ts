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
