import { chromium, webkit, expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import {
  openPracticeOptions,
  openHymnControls,
} from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("songalong", 4591);
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
  for (const arrangement of ["guitar"]) {
    await page.goto(
      server.base +
        `/piano/hymns/ill-fly-away?arrangement=${arrangement}&key=D&mode=playback`,
    );
    await page.locator("[data-name=tabNumber]").first().waitFor();
    const checkbox = page.getByRole("checkbox", {
      name: "Show fingerings",
      exact: true,
    });
    await checkbox.uncheck();
    const before = await page
      .locator(".hymn-paper")
      .evaluate((e) =>
        [...e.querySelectorAll("svg")].map((s) => s.getAttribute("viewBox")),
      );
    const frets = await page.locator(".abcjs-tab-number").allTextContents();
    await checkbox.check();
    await expect(page.locator(".guitar-fingering").first()).toBeVisible();
    expect(
      await page
        .locator(".hymn-paper")
        .evaluate((e) =>
          [...e.querySelectorAll("svg")].map((s) => s.getAttribute("viewBox")),
        ),
    ).toEqual(before);
    expect(await page.locator(".abcjs-tab-number").allTextContents()).toEqual(
      frets,
    );
    await page.screenshot({
      path: `/tmp/songalong-${arrangement}-fingers.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(checkbox).toBeChecked();
    await expect(page.locator(".guitar-fingering").first()).toBeVisible();
    await page.setViewportSize({ width: 393, height: 852 });
    await expect(
      page.getByRole("button", { name: "Show controls", exact: true }),
    ).toBeVisible();
    await openHymnControls(page);
    await expect(checkbox).toBeVisible();
    await checkbox.uncheck();
    await expect(page.locator(".guitar-fingering")).toHaveCount(0);
    await openHymnControls(page);
    await checkbox.check();
    await expect(page.locator(".guitar-fingering").first()).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.screenshot({
    path: "/tmp/songalong-melody-fingering-readable.png",
    fullPage: true,
  });
  await page.goto(
    server.base +
      "/piano/hymns/ill-fly-away?arrangement=guitar-chords&key=D&mode=playback",
  );
  await page.locator("[data-name=tabNumber]").first().waitFor();
  await expect(page.locator(".guitar-fingering")).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Show fingerings", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "PASS guitar fingers: melody and reviewed chords, unchanged tab/geometry, persistence and mobile toggle",
  );
  await page.screenshot({
    path: "/tmp/songalong-guitar-fingers.png",
    fullPage: true,
  });
} finally {
  await browser.close();
  server.stop();
}
