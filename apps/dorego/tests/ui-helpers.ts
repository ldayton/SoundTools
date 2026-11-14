import type { Page } from 'playwright';
import { parseNote } from '../src/note-picker';
/** Observe pitch fields and committed scalar settings without hidden form mirrors. */
export async function readSpecValue(page: Page, key: string) {
  if (key === 'low' || key === 'high') return String(parseNote(await page.locator(`#${key}-spin`).inputValue()));
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
