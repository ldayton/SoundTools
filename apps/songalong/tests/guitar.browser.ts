import { chromium, webkit, expect } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  // Pause holds the exact highlighted note; resume advances it, restart clears it.
  const pausedCount = await page.locator(".hymn-count").textContent();
  await page.waitForTimeout(350);
  expect(await page.locator(".hymn-count").textContent()).toBe(pausedCount);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect
    .poll(() => page.locator(".hymn-count").textContent())
    .not.toBe(pausedCount);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  await expect(activeTab).toHaveText("2");
  const thirdTab = page.locator(
    '[data-name="tabNumber"][data-passage-note="2"]',
  );
  await thirdTab.click();
  await expect(thirdTab).toHaveClass(/sight-current/);
  await expect(
    page.locator(".abcjs-note.sight-current .abcjs-lyric"),
  ).toContainText("morn");
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  await page.screenshot({
    path: join(tmpdir(), "songalong-guitar-laptop.png"),
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
  // In G the opening B is the open B string, rather than D's F# at fret 2.
  await expect(activeTab).toHaveText("0");
  await page.locator("#hymn-arrangement").selectOption("melody");
  await expect(page.locator('[data-name="tabNumber"]')).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Show fingerings" }),
  ).toBeVisible();
  await page.locator("#hymn-arrangement").selectOption("guitar");
  await expect(activeTab).toHaveText("0");
  await expect(
    page.getByRole("checkbox", { name: "Show fingerings" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-name="tabNumber"]').first()).toBeVisible();
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
    path: join(tmpdir(), "songalong-guitar-mobile.png"),
    fullPage: true,
  });
  await expect(activeTab).toHaveText("2");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(activeTab).toHaveText("3", { timeout: 15000 });
  await expect(
    page.locator(".abcjs-note.sight-current .abcjs-lyric"),
  ).toContainText("glad");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(activeTab).toHaveCount(1);
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(activeTab).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    server.base +
      "/piano/hymns/ill-fly-away?arrangement=guitar-chords&key=D&mode=playback&tempo=200",
  );
  await expect(activeTab).toHaveCount(1);

  await expect(activeTab.locator("text")).toHaveCount(4);
  await page.screenshot({
    path: join(tmpdir(), "songalong-chord-tab.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => page.locator(".hymn-count").textContent(), { timeout: 15000 })
    .not.toContain("1 /");
  await expect(activeTab).toHaveCount(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await openPracticeOptions(page);
  await expect(page.locator("#hymn-arrangement")).toHaveValue("guitar-chords");
  await page.locator("#hymn-key").click();
  await page.getByRole("option", { name: /^G major/ }).click();
  await expect(activeTab.locator("text")).toHaveCount(6);
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(activeTab).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS guitar tab: playback, pause/resume/restart, transposition, view switching, reload, mobile playback and orientation",
  );
} finally {
  await browser.close();
  server.stop();
}
