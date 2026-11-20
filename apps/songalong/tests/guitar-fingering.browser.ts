import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import {
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
} from "../../../scripts/ci/browser-harness.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import {
  openHymnControls,
  openPracticeOptions,
} from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("songalong", 4591),
  browser = await launchBrowser();
try {
  for (const width of [1440, 393]) {
    const page = await newPage(browser, { viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      server.base +
        "/piano/hymns/ill-fly-away?arrangement=guitar-edition&display=both&mode=playback",
    );
    await page.locator(".abcjs-tabNumber").first().waitFor();
    await openHymnControls(page);
    const checkbox = page.getByRole("checkbox", {
      name: "Show fingerings",
      exact: true,
    });
    await checkbox.uncheck();
    const frets = await page.locator(".abcjs-tabNumber").allTextContents();
    await checkbox.check();
    await expect(page.locator(".beginner-fingering").first()).toBeVisible();
    assert.deepEqual(
      await page.locator(".abcjs-tabNumber").allTextContents(),
      frets,
      "Finger numbers must not alter frets",
    );
    assert(frets.join("").includes("4"), "The D sharp uses fret 4");
    await page.reload();
    await openHymnControls(page);
    await expect(checkbox).toBeChecked();
    await expect(page.locator(".beginner-fingering").first()).toBeVisible();
    await checkbox.uncheck();
    await expect(page.locator(".beginner-fingering")).toHaveCount(0);
    await openPracticeOptions(page);
    await page.locator("#hymn-score-display").selectOption("tab");
    await expect(
      page.getByRole("checkbox", { name: "Show fingerings", exact: true }),
    ).toHaveCount(0);
    assert(await page.locator(".tab-rhythm-beam-secondary").count());
    assert(await page.locator(".tab-rhythm-beam-secondary").first().evaluate(n=>getComputedStyle(n).visibility === "visible" && n.getBoundingClientRect().width > 0));
    await expect(page.locator(".guitar-fermata")).toBeVisible();
    await page.locator("#hymn-score-display").selectOption("chords");
    await expect(page.locator(".abcjs-tabNumber")).toHaveCount(0);
    await expect(page.locator(".chord-chart-fermata")).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `PASS Guitar fingerings, unchanged frets, ornaments and fermata ${width}px`,
    );
  }
} catch (e) {
  await captureFailure(browser, e);
  throw e;
} finally {
  await closeBrowser(browser);
  server.stop();
}
