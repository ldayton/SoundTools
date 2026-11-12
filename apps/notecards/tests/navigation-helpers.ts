import type { Page } from "playwright";
export async function selectPractice(page: Page, mode: string) {
  // matchMedia handlers finish after the viewport CSS changes. Wait for the
  // mobile drawer's focus state before deciding whether it needs opening.
  await page.waitForFunction(() => {
    const nav = document.querySelector<HTMLElement>(".app-sidebar")!;
    return (
      !matchMedia("(max-width: 760px)").matches ||
      nav.inert === !nav.classList.contains("is-open")
    );
  });
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
  await openPracticeOptions(page);
  if (selector === "#low" || selector === "#high") {
    const input = page.locator(`#staff-${selector.slice(1)}-spin`);
    await input.click();
    await page
      .locator(`#staff-${selector.slice(1)}-spin-picker`)
      .getByRole("button", { name: value, exact: true })
      .click();
  } else if (selector === "#hymn-low" || selector === "#hymn-high") {
    const wheel = page.locator(selector + "-wheel");
    if (await wheel.isVisible()) {
      // Exercise the wheel's real scroll snapping/commit path.
      await wheel.evaluate(
        (element, target) => {
          element.scrollTop = (target - 20) * 32;
          element.dispatchEvent(new Event("scrollend"));
        },
        value ? Number(value) : 20,
      );
    } else {
      await page.locator(selector).click();
      const label = value
        ? ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][
            Number(value) % 12
          ] +
          (Math.floor(Number(value) / 12) - 1)
        : "None";
      await page
        .locator(selector + "-picker")
        .getByRole("button", { name: label, exact: true })
        .click();
    }
  } else await page.locator(selector).selectOption(value);
}

async function optionsLayoutReady(page: Page) {
  // matchMedia change listeners run after setViewportSize resolves. A desktop
  // expanded state must not be mistaken for the pending mobile collapsed state.
  await page.waitForFunction(() => {
    const visible = [
      ...document.querySelectorAll<HTMLElement>(
        "#exercise-content .practice-options",
      ),
    ].find((p) => p.getBoundingClientRect().width > 0);
    return (
      visible?.dataset.layout ===
      (matchMedia("(max-width:760px)").matches ? "mobile" : "desktop")
    );
  });
}
export async function openPracticeOptions(page: Page) {
  await optionsLayoutReady(page);
  const button = page.locator(
    "#exercise-content .practice-options:visible .options-toggle",
  );
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
}
export async function closePracticeOptions(page: Page) {
  await optionsLayoutReady(page);
  const button = page.locator(
    "#exercise-content .practice-options:visible .options-toggle",
  );
  if ((await button.getAttribute("aria-expanded")) === "true")
    await button.click();
}

export async function setPianoVisible(page: Page, visible: boolean) {
  const button = page.locator(".piano-toggle:visible");
  if ((await button.getAttribute("aria-expanded")) !== String(visible))
    await button.click();
}
