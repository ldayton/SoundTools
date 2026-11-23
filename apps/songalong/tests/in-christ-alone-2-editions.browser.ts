import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
  waitForApp,
} from "../../../scripts/ci/browser-harness.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import {
  selectHymnInstrument,
  openPracticeOptions,
  dismissPracticeDrawer,
} from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("songalong", 4615),
  browser = await launchBrowser();
const output = "/tmp/songalong-teacher-editions";
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await newPage(browser, { viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      server.base + "/piano/hymns/in-christ-alone-2?mode=playback",
    );
    await waitForApp(page, ".hymn-toolbar-instruments");
    await expect(
      page.getByRole("radio", { name: "Voice + Piano", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    for (const label of ["Guitar", "Piano", "Voice + Piano"])
      await expect(
        page.getByRole("radio", { name: label, exact: true }),
      ).toBeEnabled();
    for (const instrument of ["piano", "guitar", "sung"] as const) {
      await selectHymnInstrument(page, instrument);
      await expect(page.locator(".abcjs-note").first()).toBeVisible();
      if (instrument === "guitar") {
        await expect(
          page.locator("[data-name=tabNumber]").first(),
        ).toBeVisible();
        assert(
          !(await page.locator("[data-name=tabNumber]").allTextContents())
            .join("")
            .includes("?"),
        );
        await expect(page.locator("g.abcjs-part")).toHaveText([
          "Verse",
          "Interlude",
        ]);
        await openPracticeOptions(page);
        await page.locator("#hymn-score-display").selectOption("tab");
        await expect(page.locator(".guitar-position")).toHaveText([
          "III",
          "I",
          "VII",
          "III",
          "I",
        ]);
        await expect(page.locator(".tab-rhythm-rest").first()).toBeVisible();
      }
      if (instrument === "piano")
        await expect(page.locator("g.abcjs-part")).toHaveText([
          "Verse",
          "Interlude",
        ]);
      await openPracticeOptions(page);
      const rows = page
        .getByRole("table", { name: "Playback staves" })
        .getByRole("row");
      await expect(rows).toHaveCount(
        instrument === "sung" ? 4 : instrument === "guitar" ? 2 : 3,
      );
      await expect(page.locator(".hymn-stanza-checkbox input")).toHaveCount(4);
      const stanzas = page.locator(".hymn-stanza-checkbox input");
      await stanzas.nth(0).uncheck();
      await stanzas.nth(3).check();
      await dismissPracticeDrawer(page);
      assert(
        (await page.locator(".abcjs-lyric").allTextContents())
          .join(" ")
          .includes("guilt"),
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `${output}/${instrument}-${width}.png`,
        fullPage: true,
      });
      await openPracticeOptions(page);
      await stanzas.nth(0).check();
      await stanzas.nth(3).uncheck();
      await dismissPracticeDrawer(page);
    }
    await selectHymnInstrument(page, "guitar");
    await page.reload();
    await waitForApp(page, ".hymn-toolbar-instruments");
    await expect(
      page.getByRole("radio", { name: "Guitar", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS teacher editions ${width}px`);
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
