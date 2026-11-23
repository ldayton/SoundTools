import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  openHymnControls,
  openPracticeOptions,
  dismissPracticeDrawer,
  practiceOption,
} from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4611),
);
const browser = await launchBrowser();
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.base + "/piano/hymns/in-christ-alone-2?mode=playback");
  await waitForApp(page, ".hymn-paper");
  await page.locator(".hymn-paper svg").first().waitFor();
  await openHymnControls(page);
  await expect(page.locator(".sequence-title")).toHaveText("In Christ Alone 2");
  await expect(
    page.getByRole("radio", { name: "Voice + Piano", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#hymn-key")).toHaveValue("Original (D)");
  await expect(
    page.locator(".hymn-paper svg").first().locator(".abcjs-clef"),
  ).toHaveCount(3);
  await expect(page.locator(".hymn-ottava")).toHaveCount(0);
  await openPracticeOptions(page);
  const stanzas = page
    .getByRole("group", { name: "Stanzas", exact: true })
    .getByRole("checkbox");
  await expect(stanzas).toHaveCount(4);
  for (const stanza of await stanzas.all()) await stanza.check();
  await page
    .getByRole("button", { name: "About this hymn", exact: true })
    .click();
  const source = page.getByRole("link", {
    name: "Transcribed printed score",
    exact: true,
  });
  await expect(source).toBeVisible();
  const downloaded = await source.evaluate(async (link: HTMLAnchorElement) =>
    (await fetch(link.href)).text(),
  );
  assert.equal(
    downloaded,
    await readFile(
      new URL("../hymns/source/in-christ-alone-2.abc", import.meta.url),
      "utf8",
    ),
  );
  await practiceOption(page, "#hymn-tempo", "96");
  await dismissPracticeDrawer(page);
  async function checkInk() {
    await expect
      .poll(() =>
        page
          .locator(".sequence-score")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      )
      .toBe(true);
    const clipped = await page.locator(".hymn-paper svg").evaluateAll((svgs) =>
      svgs.flatMap((svg, index) => {
        const root = svg as SVGSVGElement,
          box = root.viewBox.baseVal;
        return [
          ...root.querySelectorAll<SVGGraphicsElement>(
            ".abcjs-note,.abcjs-lyric,.abcjs-rest",
          ),
        ].flatMap((node) => {
          const b = node.getBBox();
          if (!b.width && !b.height) return [];
          const t = root
            .getScreenCTM()!
            .inverse()
            .multiply(node.getScreenCTM()!);
          const a = new DOMPoint(b.x, b.y).matrixTransform(t),
            z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(t);
          return a.x < box.x - 1 ||
            z.x > box.x + box.width + 1 ||
            a.y < box.y - 1 ||
            z.y > box.y + box.height + 1
            ? [`System ${index}: ${node.textContent}`]
            : [];
        });
      }),
    );
    assert.deepEqual(clipped, []);
  }
  async function checkChords() {
    for (const [name, labels, notes] of [
      ["D", "D3 · F♯3 · A3", [50, 54, 57]],
      ["G", "G3 · B3 · D4", [55, 59, 62]],
      ["A", "A3 · C♯4 · E4", [57, 61, 64]],
      ["D/F♯", "F♯3 · A3 · D4", [54, 57, 62]],
      ["Bm", "B3 · D4 · F♯4", [59, 62, 66]],
      ["Em", "E3 · G3 · B3", [52, 55, 59]],
    ] as const) {
      const trigger = page
        .getByRole("button", {
          name: `Show ${name} chord diagram`,
          exact: true,
        })
        .first();
      await trigger.click();
      const dialog = page.getByRole("dialog", {
        name: `${name} chord`,
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect
        .poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity))
        .toBe("1");
      await expect(dialog.locator(".piano-chord-notes")).toHaveText(labels);
      assert.deepEqual(
        await dialog
          .locator(".is-playing[data-piano]")
          .evaluateAll((keys) =>
            keys.map((key) => Number(key.getAttribute("data-piano"))),
          ),
        [...notes],
      );
      await expect(dialog.locator("[data-string]")).toHaveCount(0);
      assert.ok(
        await dialog.evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          const label = el
            .querySelector(".piano-chord-notes")!
            .getBoundingClientRect();
          const keys = el
            .querySelector(".piano-keybed")!
            .getBoundingClientRect();
          return (
            bounds.left >= 0 &&
            bounds.right <= innerWidth &&
            label.bottom <= keys.top
          );
        }),
      );
      if (name === "D/F♯")
        await page.screenshot({
          path: `/tmp/teacher-piano-chord-${page.viewportSize()!.width}.png`,
        });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
    await expect(page.locator(".hymn-paper")).not.toContainText("(Bm)");
  }
  await checkChords();
  await checkInk();
  await page.screenshot({
    path: "/tmp/in-christ-alone-2-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openHymnControls(page);
  await dismissPracticeDrawer(page);
  await checkInk();
  await page.screenshot({
    path: "/tmp/in-christ-alone-2-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await checkChords();
  await checkInk();
  await practiceOption(page, "#hymn-key", "Eb");
  await dismissPracticeDrawer(page);
  const transposed = page
    .getByRole("button", { name: "Show E♭/G chord diagram", exact: true })
    .first();
  await transposed.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog").locator(".piano-chord-notes"),
  ).toHaveText("G3 · B♭3 · E♭4");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await practiceOption(page, "#hymn-key", "original");
  await dismissPracticeDrawer(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(server.base + "/piano/hymns/in-christ-alone?mode=playback");
  await waitForApp(page, ".hymn-paper");
  await page.locator(".hymn-paper svg").first().waitFor();
  await openHymnControls(page);
  await expect(page.locator(".sequence-title")).toHaveText("In Christ Alone");
  await expect(page.locator("#hymn-tempo")).not.toHaveValue("96 BPM");
  await page.goto(server.base + "/piano/hymns/in-christ-alone-2?mode=playback");
  await waitForApp(page, ".hymn-paper");
  await page.locator(".hymn-paper svg").first().waitFor();
  await openHymnControls(page);
  await expect(
    page.getByRole("radio", { name: "Voice + Piano", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#hymn-tempo")).toHaveValue("96 BPM");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: teacher score, four verses, bundled source, responsive ink and independent song settings",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
