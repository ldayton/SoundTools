import {selectScoreDisplay,expectScoreDisplay} from "../../../packages/music-practice/browser-tests/helpers";
import {checkVocalEdition} from "../../../packages/music-practice/test-fixtures/song-edition.browser";
import { selectHymnInstrument } from '../../../packages/music-practice/browser-tests/helpers';
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
  const crowded = await page.locator(".hymn-paper svg").evaluateAll((svgs) =>
    svgs.flatMap((svg) => {
      const melody = [...svg.querySelectorAll(".abcjs-v0 .beginner-fingering")]
        .filter((n) => getComputedStyle(n).visibility !== "hidden")
        .map((n) => n.getBoundingClientRect());
      return [...svg.querySelectorAll(".abcjs-v1 .beginner-fingering")]
        .filter((n) => getComputedStyle(n).visibility !== "hidden")
        .filter((n) => {
          const a = n.getBoundingClientRect();
          return melody.some(
            (b) =>
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top,
          );
        })
        .map((n) => n.textContent);
    }),
  );
  assert.deepEqual(crowded, [], "Opposing voice fingerings remain distinct");
  assert(
    await page
      .locator(".hymn-paper svg")
      .evaluateAll((nodes) =>
        nodes.every((n) => (n as SVGSVGElement).viewBox.baseVal.height < 600),
      ),
    "Every system fits its music without blank lyric boxes stretching the ending",
  );
}
const server = await preview("songalong", 4603),
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
      server.base + "/piano/hymns/ill-fly-away?arrangement=piano&mode=playback",
    );
    await page.locator(".abcjs-note").first().waitFor();
    await openHymnControls(page);
    await page
      .getByRole("checkbox", { name: "Show fingerings", exact: true })
      .check();
    await expect(page.locator(".beginner-fingering").first()).toBeVisible();
    await expect(page.locator("g.abcjs-part")).toHaveCount(0);
    assert(await page.locator(".hymn-paper svg").evaluateAll(svgs=>svgs.some(svg=>svg.querySelector(".abcjs-note.abcjs-v0")?.classList.contains("abcjs-mm8"))), "Chorus still starts a fresh system without its label");
    await checkScore(page);
    await openPracticeOptions(page);
  await expect(page.getByRole('table', { name: 'Playback staves' }).getByRole('columnheader')).toHaveText(['Staff', 'Show', 'Play']);
    await expect(page.getByRole('radiogroup', { name: 'Instrument', exact: true }).getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Voice', exact: true })).toBeEnabled();
    await selectHymnInstrument(page, 'guitar');
    await expect(page.locator("[data-name=tabNumber]").first()).toBeVisible();
    assert(
      !(await page.locator("[data-name=tabNumber]").allTextContents())
        .join("")
        .includes("?"),
    );
    await expect(page.locator("g.abcjs-part")).toHaveCount(0);
    assert(
      (await page.locator("[data-name=tabNumber]").allTextContents())
        .join("")
        .includes("3"),
    );
    await expect(page.locator("#hymn-hands")).toHaveCount(0);
    for (const display of ["notation", "tab", "both", "chords"]) {
      await selectScoreDisplay(page,display);
      if (display === "notation" || display === "chords")
        await expect(page.locator("[data-name=tabNumber]")).toHaveCount(0);
      else
        await expect(
          page.locator("[data-name=tabNumber]").first(),
        ).toBeVisible();
      if (display === "notation" || display === "both")
        await expect(page.locator(".abcjs-time-signature")).toHaveCount(1);
      if (display === "tab") {
        await expect(page.locator(".tab-rhythm-dot").first()).toBeVisible();
        assert(await page.locator(".tab-rhythm-half").count());
        assert(await page.locator(".tab-rhythm-dot").count());
        await expect(page.locator(".tab-rhythm-continuation")).toHaveCount(1);

        await expect(page.locator(".guitar-fermata")).toBeVisible();
        assert(await page.locator(".tab-rhythm-beam-secondary").count());
        await expect(page.locator(".tab-rhythm-time")).toHaveText(["4", "4"]);
        assert(
          (await page.locator(".abcjs-lyric").allTextContents())
            .join(" ")
            .includes("Some"),
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
          nodes
            .filter((n) => n.getAttribute("data-name") !== "scripts.ufermata")
            .every((n) => getComputedStyle(n).visibility === "hidden"),
        ),
    );
    await expect(page.locator(".chord-hold")).toHaveCount(0);
    await expect(page.locator(".chord-chart-fermata")).toBeVisible();
    await expect(page.locator(".hymn-strum-pattern")).toBeVisible();
    await checkScore(page);
    // All three verses retain their words and the shared chorus.
    const stanzas = page.locator(".hymn-stanza-checkbox input");
    await expect(stanzas).toHaveCount(3);
    await stanzas.nth(1).check();
    await stanzas.nth(2).check();
    await selectScoreDisplay(page,"tab");
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
    await expect(page.locator("g.abcjs-part")).toHaveCount(0);
    assert(
      (await page.locator(".abcjs-lyric").allTextContents())
        .join(" ")
        .includes("Just"),
    );
    await stanzas.nth(0).check();
    await stanzas.nth(2).uncheck();
    await selectScoreDisplay(page,"tab");
    await page.reload();
    await openPracticeOptions(page);
    await expect(page.getByRole('radio', { name: 'Guitar', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expectScoreDisplay(page,"tab");
    await dismissPracticeDrawer(page);
    if (width === 1440) {
      await page.goto(
        server.base +
          "/piano/hymns/ill-fly-away?arrangement=guitar-edition&display=both&mode=wait&capo=0",
      );
      await page.locator(".hymn-count").waitFor();
      await midiAction(page, "Connect MIDI keyboard");
      await dismissPracticeDrawer(page);
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-hands")).toHaveValue("both");
      await selectScoreDisplay(page,"chords");
      await expect(page.locator("#hymn-hands")).toHaveValue("both");
      const before = await page.locator(".hymn-count").textContent();
      await selectScoreDisplay(page,"both");
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
        for (const p of [48, 52, 64])
          (window as any).midiTest.send([0x90, p, 90]);
      });
      await expect(page.locator(".hymn-count")).not.toHaveText(before!);
      await page.evaluate(() => {
        for (const p of [48, 52, 64])
          (window as any).midiTest.send([0x80, p, 0]);
      });
      await openPracticeOptions(page);
      await page.locator("#hymn-hands").selectOption("left");
      await selectScoreDisplay(page,"chords");
      await page.reload();
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-hands")).toHaveValue("left");
      await expectScoreDisplay(page,"chords");
      await dismissPracticeDrawer(page);
      await midiAction(page, "Connect MIDI keyboard");
      const chordBefore = await page.locator(".hymn-count").textContent();
      await page.evaluate(() => {
        for (const p of [48, 52, 55, 60, 64])
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
    await checkVocalEdition(page,server.base,"ill-fly-away");
    await page.close();
    console.log(`PASS I'll Fly Away editions ${width}px`);
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
