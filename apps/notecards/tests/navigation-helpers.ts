import type { Page } from "playwright";
export async function selectPractice(page: Page, mode: string) {
  const link = page.locator(`nav a[data-mode="${mode}"]`);
  if (
    (await page.locator(".nav-toggle").isVisible()) &&
    (await page.locator(".nav-toggle").getAttribute("aria-expanded")) !== "true"
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await link.click();
}
export async function midiAction(page: Page, label: string) {
  if (
    !(await page
      .locator(".keyboard-menu")
      .evaluate((e: HTMLDetailsElement) => e.open))
  )
    await page.locator(".keyboard-menu summary").click();
  await page.getByRole("button", { name: label, exact: true }).click();
}
export async function practiceOption(
  page: Page,
  selector: string,
  value: string,
) {
  const scope = page.locator("#exercise-content .practice-options:visible");
  if (!(await scope.evaluate((e: HTMLDetailsElement) => e.open)))
    await scope.locator(":scope > summary").click();
  if (selector === "#low" || selector === "#high") {
    const input = page.locator(`#staff-${selector.slice(1)}-spin`);
    await input.click();
    await page
      .locator(`#staff-${selector.slice(1)}-spin-picker`)
      .getByRole("button", { name: value, exact: true })
      .click();
  } else await page.locator(selector).selectOption(value);
}

export async function closePracticeOptions(page: Page) {
  const scope = page.locator("#exercise-content .practice-options:visible");
  if (await scope.evaluate((e: HTMLDetailsElement) => e.open))
    await scope.locator(":scope > summary").click();
}
