import { chromium, webkit, expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("notewise", 4597);
const browser = await (
  process.env.TEST_BROWSER === "webkit" ? webkit : chromium
).launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    server.base +
      "/guitar/scales?key=C&scale=major&set=hila&shape=1&labels=none",
  );
  const tones = page.locator(".scale-diagram .scale-tone");
  await expect(tones).toHaveCount(17);
  await openPracticeOptions(page);
  await expect(page.getByLabel("Shape set", { exact: true })).toHaveValue(
    "hila",
  );
  await expect(
    page.getByLabel("Shape", { exact: true }).locator("option"),
  ).toHaveCount(7);
  await expect(page.locator("#scale-linked-pattern")).toHaveCount(0);
  await expect(
    page.locator('#scale-dot-labels option[value="fingers"]'),
  ).toHaveCount(0);
  for (let shape = 1; shape <= 7; shape++) {
    await page.getByLabel("Shape", { exact: true }).selectOption(String(shape));
    await expect(tones).toHaveCount(17);
    const pitches = await tones.evaluateAll((es) =>
      es.map((e) => Number(e.getAttribute("data-midi"))),
    );
    expect(new Set(pitches).size).toBe(17);
  }
  await page.reload();
  await openPracticeOptions(page);
  await expect(page.getByLabel("Shape", { exact: true })).toHaveValue("7");
  await page.locator("#scale-key").selectOption("2");
  await expect(tones).toHaveCount(17);
  expect(
    await tones.evaluateAll((es) =>
      es.every((e) => Number(e.getAttribute("data-fret")) <= 18),
    ),
  ).toBe(true);
  await page.getByLabel("Shape set", { exact: true }).selectOption("standard");
  await expect(page.locator("#scale-pattern")).toBeVisible();
  await expect(page.locator("#scale-linked-pattern")).toBeVisible();
  await page.locator("#scale-pattern").selectOption("4");
  await page.getByLabel("Shape set", { exact: true }).selectOption("hila");
  await page.locator("#scale-key").selectOption("0");
  await page.getByLabel("Shape", { exact: true }).selectOption("1");
  await page.locator("#scale-dot-labels").selectOption("none");
  await page.locator("#scale-title").click();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByLabel("Shape", { exact: true })).toHaveValue("2");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("Shape", { exact: true })).toHaveValue("1");
  await page.keyboard.press("]");
  expect(
    await tones.evaluateAll((es) =>
      es.every((e) => Number(e.getAttribute("data-fret")) >= 13),
    ),
  ).toBe(true);
  await page.keyboard.press("[");
  await page.screenshot({
    path: "/tmp/notewise-hila-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/notewise-hila-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS Hila shapes: seven diagrams, settings, reload, transposition, standard set, keyboard and mobile",
  );
} finally {
  await browser.close();
  server.stop();
}
