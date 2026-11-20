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
  openPracticeOptions,
  dismissPracticeDrawer,
} from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("songalong", 4574),
  browser = await launchBrowser();
try {
  for (const width of [1440, 393]) {
    const page = await newPage(browser, { viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const legacy of ["guitar", "guitar-chords"]) {
      await page.goto(
        server.base +
          `/piano/hymns/ill-fly-away?arrangement=${legacy}&key=D&display=both&mode=playback`,
      );
      await page.locator(".abcjs-tabNumber").first().waitFor();
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-arrangement")).toHaveValue("Guitar");
      await expect(page.locator("#hymn-key")).toHaveCount(0);
      assert(
        (await page.locator(".abcjs-chord").allTextContents()).includes("G7"),
      );
      assert(
        !(await page.locator(".abcjs-chord").allTextContents()).includes("A7"),
      );
      await page.locator("#hymn-score-display").selectOption("chords");
      await expect(page.locator(".hymn-strum-pattern")).toBeVisible();
      await page.locator("#hymn-arrangement").click();
      await expect(
        page.locator(".mantine-Select-dropdown:visible [role=option]"),
      ).toHaveText(["Piano", "Guitar"]);
      await page.getByRole("option", { name: "Piano", exact: true }).click();
      await expect(page.locator(".abcjs-tabNumber")).toHaveCount(0);
      await page.locator("#hymn-arrangement").click();
      await page.getByRole("option", { name: "Guitar", exact: true }).click();
      await expect(page.locator("#hymn-score-display")).toHaveValue("chords");
      await dismissPracticeDrawer(page);
      await page.reload();
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-score-display")).toHaveValue("chords");
      await dismissPracticeDrawer(page);
    }
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.close();
    console.log(
      `PASS Guitar legacy-link migration and independent display ${width}px`,
    );
  }
} catch (e) {
  await captureFailure(browser, e);
  throw e;
} finally {
  await closeBrowser(browser);
  server.stop();
}
