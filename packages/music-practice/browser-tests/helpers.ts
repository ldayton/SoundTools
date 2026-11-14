import type { Page } from "playwright";
export async function selectPractice(page: Page, mode: string) {
  // Wait for React's responsive layout commit after a viewport change.
  await page.waitForFunction(
    () =>
      matchMedia("(min-width: 48em)").matches ===
      !!document.querySelector(".mantine-AppShell-navbar"),
  );
  const link = page.locator(`nav a[data-mode="${mode}"]`);
  if (
    (await page.locator(".nav-toggle").isVisible()) &&
    (await page.locator(".nav-toggle").getAttribute("aria-expanded")) !== "true"
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await link.click();
  await page.locator(".mantine-Drawer-content").waitFor({ state: "hidden" });
}
export async function midiAction(
  page: Page,
  label: string,
  advanceClock?: () => Promise<void>,
) {
  await openNavigation(page);
  if (
    (await page.locator(".keyboard-menu").getAttribute("aria-expanded")) !==
    "true"
  )
    await page.locator(".keyboard-menu").click();
  await advanceClock?.();
  await page.getByRole("button", { name: label, exact: true }).click();
  await advanceClock?.();
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
  } else if (selector === "#hymn-tempo" || selector === "#rhythm-tempo") {
    await page.locator(selector).fill(value);
    await page.locator(selector).press("Enter");
  } else await page.locator(selector).selectOption(value);
}

async function optionsLayoutReady(page: Page) {
  // matchMedia change listeners run after setViewportSize resolves. A desktop
  // expanded state must not be mistaken for the pending mobile collapsed state.
  await page.waitForFunction(() => {
    const visible = document.querySelector<HTMLElement>(".practice-options");
    return (
      visible?.dataset.layout ===
      (matchMedia("(max-width:1119px)").matches ? "mobile" : "desktop")
    );
  });
}
export async function openPracticeOptions(page: Page) {
  await optionsLayoutReady(page);
  const button = page.getByRole("button", {
    name: /^(Expand|Collapse) practice options$/,
  });
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
}
export async function closePracticeOptions(page: Page) {
  await optionsLayoutReady(page);
  const button = page.getByRole("button", {
    name: /^(Expand|Collapse) practice options$/,
  });
  if ((await button.getAttribute("aria-expanded")) === "true")
    await button.click();
}

export async function setPianoVisible(page: Page, visible: boolean) {
  const button = page.locator(".piano-toggle:visible");
  if ((await button.getAttribute("aria-expanded")) !== String(visible))
    await button.click();
}

async function navigationLayoutReady(page: Page) {
  await page.waitForFunction(
    () =>
      matchMedia("(min-width: 48em)").matches ===
      !!document.querySelector(".mantine-AppShell-navbar"),
  );
}
export async function openNavigation(page: Page) {
  await navigationLayoutReady(page);
  const toggle = page.locator(".nav-toggle");
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  await page.locator("#practice-navigation").waitFor();
}
export async function closeNavigation(page: Page) {
  await navigationLayoutReady(page);
  const toggle = page.locator(".nav-toggle");
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) === "true"
  )
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
  await page.locator(".mantine-Drawer-content").waitFor({ state: "hidden" });
}
