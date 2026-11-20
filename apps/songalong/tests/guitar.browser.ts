import { chromium, webkit, expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("songalong", 4574);
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
      "/piano/hymns/ill-fly-away?arrangement=guitar&key=D&mode=playback",
  );
  await page
    .locator(".abcjs-tab-number, .abcjs-tabNumber, [data-name=tabNumber]")
    .first()
    .waitFor();

  const activeTab = page.locator('[data-name="tabNumber"].sight-current');
  await expect(activeTab).toHaveCount(1);
  await expect(activeTab).toHaveText("2");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(activeTab).toHaveText("3", { timeout: 15000 });
  await expect(
    page.locator(".abcjs-note.sight-current .abcjs-lyric"),
  ).toContainText("glad");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({
    path: "/Users/lily/Documents/Codex/2026-11-18/ex/outputs/songalong-guitar-laptop.png",
    fullPage: true,
  });
  await openPracticeOptions(page);

  expect(await page.locator(".abcjs-chord").allTextContents()).toEqual(
    expect.arrayContaining(["D", "G", "A7"]),
  );
  await page.locator("#hymn-key").click();
  await page.getByRole("option", { name: /^G major/ }).click();
  await expect
    .poll(() => page.locator(".abcjs-chord").allTextContents())
    .toEqual(expect.arrayContaining(["G", "C", "D7"]));
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(
    server.base +
      "/piano/hymns/ill-fly-away?arrangement=guitar&key=D&mode=playback",
  );
  await page
    .locator(".abcjs-tab-number, .abcjs-tabNumber, [data-name=tabNumber]")
    .first()
    .waitFor();
  await page.screenshot({
    path: "/Users/lily/Documents/Codex/2026-11-18/ex/outputs/songalong-guitar-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS guitar melody tab and transposed chords on desktop and mobile",
  );
} finally {
  await browser.close();
  server.stop();
}
