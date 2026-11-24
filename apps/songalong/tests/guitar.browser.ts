import { selectHymnInstrument } from '../../../packages/music-practice/browser-tests/helpers';
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
  practiceOption,
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
      await expect(page.getByRole('radio', { name: 'Guitar', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator("#hymn-key")).toHaveValue(/D major/);
      await expect(page.locator(".hymn-score-setup")).toHaveText("Capo 2 · Sounding key: D major");
      if(width===1440){
        await expect(page.locator("#hymn-capo")).toHaveValue("2");
        await practiceOption(page,"#hymn-capo","0");
        await expect(page.locator(".hymn-score-setup")).toHaveText("No capo · Sounding key: D major");
        await expect(page.locator("#hymn-key")).toHaveValue(/D major/);
        await practiceOption(page,"#hymn-capo","2");
      }
      assert(
        (await page.locator(".abcjs-chord").allTextContents()).includes("G7"),
      );
      assert(
        !(await page.locator(".abcjs-chord").allTextContents()).includes("A7"),
      );
      await page.locator("#hymn-score-display").selectOption("chords");
      await expect(page.locator(".hymn-strum-pattern")).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'Instrument', exact: true }).getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Voice + Piano', exact: true })).toBeEnabled();
      await selectHymnInstrument(page, 'piano');
      await expect(page.locator(".abcjs-tabNumber")).toHaveCount(0);
      await selectHymnInstrument(page, 'guitar');
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
