import { launchBrowser, newPage, createContext } from "../../../scripts/ci/browser-harness.cjs";
import { expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("notewise", 4595),
  browser = await launchBrowser();
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    server.base +
      "/guitar/scales?key=C&scale=major&pattern=map&from=1&to=5&labels=none",
  );
  const tones = page.locator(".scale-diagram .scale-tone");
  await expect(tones).toHaveCount(18);
  await expect(
    page.locator(".scale-diagram .scale-tone.scale-root"),
  ).toHaveCount(3);
  await openPracticeOptions(page);
  await expect(page.getByLabel("First fret", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Last fret", { exact: true })).toHaveValue("5");
  await expect(
    page.getByLabel("Last fret", { exact: true }).locator("option").last(),
  ).toHaveAttribute("value", "18");
  await page.getByLabel("Last fret", { exact: true }).selectOption("12");
  await page.getByLabel("First fret", { exact: true }).selectOption("7");
  await expect
    .poll(() =>
      tones.evaluateAll((es) =>
        es
          .map((e) => Number(e.getAttribute("data-fret")))
          .every((f) => f >= 7 && f <= 12),
      ),
    )
    .toBe(true);
  await page.reload();
  await openPracticeOptions(page);
  await expect(page.getByLabel("First fret", { exact: true })).toHaveValue("7");
  await expect(page.getByLabel("Last fret", { exact: true })).toHaveValue("12");
  await page.locator("#scale-pattern").selectOption("4");
  await expect(page.getByLabel("First fret", { exact: true })).toHaveCount(0);
  await page.locator("#scale-pattern").selectOption("map");
  await expect(page.getByLabel("First fret", { exact: true })).toHaveValue("7");
  await page.setViewportSize({ width: 393, height: 852 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS fret range map: complete map, controls, bookmark reload, shape switching and mobile",
  );
} finally {
  await browser.close();
  server.stop();
}
