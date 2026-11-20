import { chromium, webkit, expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("songalong", 4593);
const browser = await (
  process.env.TEST_BROWSER === "webkit" ? webkit : chromium
).launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
    hasTouch: true,
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    server.base +
      "/piano/hymns/ill-fly-away?arrangement=guitar-chords&key=D&mode=playback",
  );
  const d = page
    .getByRole("button", { name: "Show D chord diagram", exact: true })
    .first();
  await d.click();
  const modal = page.getByRole("dialog", { name: "D chord", exact: true });
  await expect(modal).toBeVisible();
  await expect(
    modal.getByRole("img", { name: /guitar chord/ }),
  ).toHaveAttribute(
    "aria-label",
    /low E: muted; A: muted; D: open; G: fret 2; B: fret 3; high E: fret 2/,
  );
  await expect(modal).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "/tmp/songalong-chord-diagram.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(d).toBeFocused();
  const a7 = page
    .getByRole("button", { name: "Show A7 chord diagram", exact: true })
    .first();
  await a7.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("dialog", { name: "A7 chord", exact: true })
      .getByRole("img", { name: /guitar chord/ }),
  ).toHaveAttribute(
    "aria-label",
    /A: open; D: fret 2; G: open; B: fret 2; high E: open/,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await openPracticeOptions(page);
  await page.locator("#hymn-key").click();
  await page.getByRole("option", { name: /^G major/ }).click();
  await page
    .getByRole("button", { name: "Show C chord diagram", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "C chord", exact: true })
      .getByRole("img", { name: /guitar chord/ }),
  ).toHaveAttribute(
    "aria-label",
    /A: fret 3; D: fret 2; G: open; B: fret 1; high E: open/,
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(
    server.base +
      "/piano/hymns/ill-fly-away?arrangement=guitar&key=D&mode=playback",
  );
  await page
    .getByRole("button", { name: "Show D chord diagram", exact: true })
    .first()
    .tap();
  await expect(modal).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS clickable chord diagrams: exact D/G/A7 shapes, transposition, keyboard, focus return and mobile",
  );
} finally {
  await browser.close();
  server.stop();
}
