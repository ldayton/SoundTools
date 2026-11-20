import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
  openHymnControls,
  midiAction,
} from "../../../packages/music-practice/browser-tests/helpers";
async function checkScore(page: import("playwright").Page) {
  const clipped = await page.locator(".hymn-paper svg").evaluateAll((svgs) =>
    svgs.flatMap((svg, index) => {
      const root = (svg as SVGSVGElement).getScreenCTM()!.inverse(),
        view = (svg as SVGSVGElement).viewBox.baseVal;
      return [
        ...svg.querySelectorAll<SVGGraphicsElement>(
          ".abcjs-lyric,.abcjs-tabNumber,.beginner-fingering,.abcjs-part,.abcjs-bar-number,.tab-rhythm",
        ),
      ].flatMap((node) => {
        if (getComputedStyle(node).visibility === "hidden") return [];
        const b = node.getBBox();
        if (!b.width && !b.height) return [];
        const t = root.multiply(node.getScreenCTM()!),
          a = new DOMPoint(b.x, b.y).matrixTransform(t),
          z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(t);
        return a.x < view.x - 1 ||
          z.x > view.x + view.width + 1 ||
          a.y < view.y - 1 ||
          z.y > view.y + view.height + 1
          ? [`System ${index}: ${node.textContent}`]
          : [];
      });
    }),
  );
  assert.deepEqual(clipped, []);
  assert(
    await page
      .locator(".hymn-paper svg")
      .evaluateAll((nodes) =>
        nodes.every((n) => (n as SVGSVGElement).viewBox.baseVal.height < 600),
      ),
    "Every system fits its music without blank lyric boxes stretching the ending",
  );
}
const server = await preview("songalong", 4599),
  browser = await launchBrowser();
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await newPage(browser, { viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript({
      content: await readFile(
        new URL(
          "../../../packages/music-practice/test-fixtures/midi.js",
          import.meta.url,
        ),
        "utf8",
      ),
    });
    await page.goto(
      server.base +
        "/piano/hymns/in-christ-alone?arrangement=piano&mode=playback",
    );
    await page.locator(".abcjs-note").first().waitFor();
    await openHymnControls(page);
    await page
      .getByRole("checkbox", { name: "Show fingerings", exact: true })
      .check();
    await expect(page.locator(".beginner-fingering").first()).toBeVisible();
    await expect(page.locator("g.abcjs-part")).toHaveText(["Verse", "Ending"]);
    await checkScore(page);
    await openPracticeOptions(page);
    await page.locator("#hymn-arrangement").click();
    await expect(
      page.locator(".mantine-Select-dropdown:visible [role=option]"),
    ).toHaveText(["Piano", "Guitar"]);
    await page.getByRole("option", { name: "Guitar", exact: true }).click();
    await expect(page.locator("[data-name=tabNumber]").first()).toBeVisible();
    assert(
      !(await page.locator("[data-name=tabNumber]").allTextContents())
        .join("")
        .includes("?"),
    );
    await expect(page.locator("g.abcjs-part")).toHaveText(["Capo 2", "Ending"]);
    assert(
      (await page.locator("[data-name=tabNumber]").allTextContents())
        .join("")
        .includes("8"),
    );
    await expect(page.locator("#hymn-hands")).toHaveCount(0);
    for (const display of ["notation", "tab", "both", "chords"]) {
      await page.locator("#hymn-score-display").selectOption(display);
      if (display === "notation" || display === "chords")
        await expect(page.locator("[data-name=tabNumber]")).toHaveCount(0);
      else
        await expect(
          page.locator("[data-name=tabNumber]").first(),
        ).toBeVisible();
      if (display === "tab") {
        await expect(page.locator(".tab-rhythm").first()).toBeVisible();
        assert(await page.locator(".tab-rhythm-half").count());
        assert(await page.locator(".tab-rhythm-dot").count());
        assert(await page.locator(".tab-rhythm-beam-secondary").count());
        assert(await page.locator(".tab-rhythm-rest").count());
        await expect(page.locator(".guitar-position")).toHaveText([
          "III",
          "I",
          "VII",
          "III",
          "I",
        ]);
        await expect(page.locator(".tab-rhythm-time")).toHaveText(["3", "4"]);
        assert(
          (await page.locator(".abcjs-lyric").allTextContents())
            .join(" ")
            .includes("Christ"),
        );
      }
    }
    assert.equal(
      await page.locator(".chords-only-score").count(),
      await page.locator(".hymn-paper svg").count(),
    );
    assert(
      await page
        .locator(".chords-only-score .abcjs-note path")
        .evaluateAll((nodes) =>
          nodes.every((n) => getComputedStyle(n).visibility === "hidden"),
        ),
    );
    await checkScore(page);
    // Retain every verse and the final verse's shorter ending in both editions.
    const stanzas = page.locator(".hymn-stanza-checkbox input");
    await expect(stanzas).toHaveCount(3);
    await stanzas.nth(1).check();
    await stanzas.nth(2).check();
    await page.locator("#hymn-score-display").selectOption("tab");
    await checkScore(page);
    const rows = await page
      .locator(".hymn-paper svg")
      .first()
      .locator(".abcjs-lyric")
      .evaluateAll((nodes) =>
        nodes.flatMap((n) => {
          const spans = [...n.querySelectorAll("tspan")];
          return (spans.length ? spans : [n])
            .filter((t) => t.textContent?.trim())
            .map((t) => t.getBoundingClientRect().top);
        }),
      );
    assert.equal(
      new Set(rows.map((y) => Math.round(y))).size,
      3,
      "Each selected verse has its own lyric row",
    );
    await stanzas.nth(1).uncheck();
    await stanzas.nth(2).uncheck();
    await stanzas.nth(0).uncheck();
    await stanzas.nth(2).check();
    await expect(page.locator("g.abcjs-part")).toHaveText(["Capo 2"]);
    assert(
      (await page.locator(".abcjs-lyric").allTextContents())
        .join(" ")
        .includes("guilt"),
    );
    await stanzas.nth(0).check();
    await stanzas.nth(2).uncheck();
    await page.locator("#hymn-score-display").selectOption("tab");
    await page.reload();
    await openPracticeOptions(page);
    await expect(page.locator("#hymn-arrangement")).toHaveValue("Guitar");
    await expect(page.locator("#hymn-score-display")).toHaveValue("tab");
    await dismissPracticeDrawer(page);
    if (width === 1440) {
      await page.goto(
        server.base +
          "/piano/hymns/in-christ-alone?arrangement=guitar-edition&display=both&mode=wait",
      );
      await page.locator(".hymn-count").waitFor();
      await midiAction(page, "Connect MIDI keyboard");
      await dismissPracticeDrawer(page);
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-hands")).toHaveValue("both");
      await page.locator("#hymn-score-display").selectOption("chords");
      await expect(page.locator("#hymn-hands")).toHaveValue("both");
      const before = await page.locator(".hymn-count").textContent();
      await page.locator("#hymn-score-display").selectOption("both");
      await expect(page.locator(".hymn-count")).toHaveText(before!);
      await dismissPracticeDrawer(page);
      await page.evaluate(() => {
        for (const p of [53, 57, 60, 65]) {
          (window as any).midiTest.send([0x90, p, 90]);
          (window as any).midiTest.send([0x80, p, 0]);
        }
      });
      await expect(page.locator(".hymn-count")).toHaveText(before!);
      await page.evaluate(() => {
        for (const p of [55, 57]) (window as any).midiTest.send([0x90, p, 90]);
      });
      await expect(page.locator(".hymn-count")).not.toHaveText(before!);
      await page.evaluate(() => {
        for (const p of [55, 57]) (window as any).midiTest.send([0x80, p, 0]);
      });
      await openPracticeOptions(page);
      await page.locator("#hymn-hands").selectOption("left");
      await page.locator("#hymn-score-display").selectOption("chords");
      await page.reload();
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-hands")).toHaveValue("left");
      await expect(page.locator("#hymn-score-display")).toHaveValue("chords");
      await dismissPracticeDrawer(page);
      await midiAction(page, "Connect MIDI keyboard");
      const chordBefore = await page.locator(".hymn-count").textContent();
      await page.evaluate(() => {
        for (const p of [55, 59, 62, 67])
          (window as any).midiTest.send([0x90, p, 90]);
      });
      await expect(page.locator(".hymn-count")).not.toHaveText(chordBefore!);
    }
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.close();
    console.log(`PASS In Christ Alone editions ${width}px`);
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
