import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import {
  launchBrowser,
  newPage,
  waitForApp,
  captureFailure,
  closeBrowser,
} from "../../../scripts/ci/browser-harness.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import {
  selectHymnInstrument,
  practiceOption,
  dismissPracticeDrawer,
} from "../../../packages/music-practice/browser-tests/helpers";
import { stagedHymn } from "../../../packages/music-practice/test-fixtures/hymns";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4613),
);
const browser = await launchBrowser();
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(
      `${server.base}/piano/hymns/${stagedHymn.id}?mode=playback&arrangement=chords`,
    );
    await waitForApp(page, ".hymn-toolbar-instruments");
    await dismissPracticeDrawer(page);
    const group = page.getByRole("radiogroup", {
      name: "Instrument",
      exact: true,
    });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(
      page.getByRole("radio", { name: "Guitar", exact: true }),
    ).toBeDisabled();
    const piano = page.getByRole("radio", { name: "Piano", exact: true }),
      sung = page.getByRole("radio", {
        name: "Sung accompaniment",
        exact: true,
      });
    await expect(piano).toHaveAttribute("aria-checked", "true");
    assert.equal(
      await group.evaluate((el) => !!el.closest(".mantine-AppShell-header")),
      true,
    );
    await expect
      .poll(() =>
        group.evaluate((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.left >= 0 &&
            b.right <= innerWidth &&
            b.top >= 0 &&
            b.bottom <=
              document
                .querySelector(".mantine-AppShell-header")!
                .getBoundingClientRect().bottom
          );
        }),
      )
      .toBe(true);
    const boxes = await group
      .getByRole("radio")
      .evaluateAll((elements) =>
        elements.map((el) => el.getBoundingClientRect().toJSON()),
      );
    assert.ok(boxes.every((b) => Math.abs(b.top - boxes[0].top) < 1));
    assert.ok(
      boxes[0].right <= boxes[1].left + 1 &&
        boxes[1].right <= boxes[2].left + 1,
    );
    await piano.focus();
    await piano.press("ArrowRight");
    await expect(sung).toHaveAttribute("aria-checked", "true");
    await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);
    await expect(page.locator("#hymn-arrangement")).toHaveCount(0);
    await expect(page.locator("#saved")).toHaveText("Saved on this device.");
    await page.reload();
    await waitForApp(page, ".hymn-toolbar-instruments");
    await expect(sung).toHaveAttribute("aria-checked", "true");
    // The saved instrument also survives navigating to a clean song link.
    await page.goto(
      `${server.base}/piano/hymns/${stagedHymn.id}?mode=playback`,
    );
    await waitForApp(page, ".hymn-toolbar-instruments");
    await expect(sung).toHaveAttribute("aria-checked", "true");
    await selectHymnInstrument(page, "piano");
    await practiceOption(page, "#hymn-arrangement", "bass");
    await expect(piano).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#hymn-arrangement option")).toHaveCount(4);
    await dismissPracticeDrawer(page);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `/tmp/songalong-instruments-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(server.base + "/piano/hymns/in-christ-alone-2?mode=playback");
  await waitForApp(page, ".hymn-toolbar-instruments");
  await expect(
    page.getByRole("radio", { name: "Sung accompaniment", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("radio", { name: "Piano", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("radio", { name: "Guitar", exact: true }),
  ).toBeDisabled();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: primary instrument radios, supported choices, keyboard exclusivity, saved selection and responsive toolbar",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
