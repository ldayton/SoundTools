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
  const labelCollisions = await page.locator('.hymn-paper svg').evaluateAll(svgs=>svgs.flatMap(svg=>{
    const labels=[...svg.querySelectorAll('.abcjs-part,.abcjs-tempo')].map(n=>n.getBoundingClientRect());
    return [...svg.querySelectorAll('.abcjs-bar-number')].filter(n=>{const a=n.getBoundingClientRect();return labels.some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top);}).map(n=>n.textContent);
  }));
  assert.deepEqual(labelCollisions, [], 'Bar numbers clear section and tempo labels');

  assert(
    await page
      .locator(".hymn-paper svg")
      .evaluateAll((nodes) =>
        nodes.every((n) => (n as SVGSVGElement).viewBox.baseVal.height < 600),
      ),
    "Every system fits its music without blank lyric boxes stretching the ending",
  );
}
const server = await preview("songalong", Number(process.env.TEST_PORT || 4607)),
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
        "/piano/hymns/o-come-all-ye-faithful?arrangement=piano&mode=playback",
    );
    await page.locator(".abcjs-note").first().waitFor();
    await openHymnControls(page);
    await page
      .getByRole("checkbox", { name: "Show fingerings", exact: true })
      .check();
    await expect(page.locator(".beginner-fingering").first()).toBeVisible();
    await expect(page.locator("g.abcjs-part")).toHaveText(["Verse", "Refrain"]);
    await expect(page.locator('.hymn-paper svg').first().locator('.abcjs-note.abcjs-mm1').first()).toBeVisible();
    await expect(page.locator('.hymn-paper svg').last().locator('.abcjs-note.abcjs-mm19').first()).toBeVisible();
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
    await expect(page.locator("g.abcjs-part")).toHaveText(["Verse", "Refrain"]);
    assert(
      (await page.locator("[data-name=tabNumber]").allTextContents())
        .join("")
        .includes("3"),
    );
    await expect(page.locator("#hymn-hands")).toHaveCount(0);
    await dismissPracticeDrawer(page);
    await page.getByRole('button',{name:'Show D7 chord diagram',exact:true}).nth(3).click();
    await expect(page.getByRole('dialog',{name:'D7 chord',exact:true})).toBeVisible();
    assert.deepEqual(await page.getByRole('dialog').locator('[data-string]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-fret')==='not-played'?null:Number(n.getAttribute('data-fret')))),[2,3,4,null,null,null]);
    await page.getByRole('button',{name:'Close chord diagram',exact:true}).click();
    await openPracticeOptions(page);

    for (const display of ["notation", "tab", "both", "chords"]) {
      await page.locator("#hymn-score-display").selectOption(display);
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
        await expect(page.locator(".tab-rhythm-continuation")).toHaveCount(0);

        await expect(page.locator(".tab-rhythm-time")).toHaveText(["4", "4"]);
        assert(
          (await page.locator(".abcjs-lyric").allTextContents())
            .join(" ")
            .includes("come"),
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
    await checkScore(page);
    // All three verses retain their words and the shared chorus.
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
    await expect(page.locator("g.abcjs-part")).toHaveText(["Verse", "Refrain"]);
    assert(
      (await page.locator(".abcjs-lyric").allTextContents())
        .join(" ")
        .includes("Word"),
    );
    await stanzas.nth(0).check();
    await stanzas.nth(2).uncheck();
    await page.locator("#hymn-score-display").selectOption("tab");
    await page.reload();
    await page.locator(".hymn-paper svg").first().waitFor();
    await openPracticeOptions(page);
    await expect(page.locator("#hymn-arrangement")).toHaveValue("Guitar");
    await expect(page.locator("#hymn-score-display")).toHaveValue("tab");
    await dismissPracticeDrawer(page);
    if (width === 1440) {
      await page.goto(
        server.base +
          "/piano/hymns/o-come-all-ye-faithful?arrangement=guitar-edition&display=both&mode=wait",
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
        for (const p of [43, 47, 55]) (window as any).midiTest.send([0x90, p, 90]);
      });
      await expect(page.locator(".hymn-count")).not.toHaveText(before!);
      await page.evaluate(() => {
        for (const p of [43, 47, 55]) (window as any).midiTest.send([0x80, p, 0]);
      });
      await openPracticeOptions(page);
      await page.locator("#hymn-hands").selectOption("left");
      await page.locator("#hymn-score-display").selectOption("chords");
      await page.reload();
      await page.locator(".hymn-paper svg").first().waitFor();
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-hands")).toHaveValue("left");
      await expect(page.locator("#hymn-score-display")).toHaveValue("chords");
      await dismissPracticeDrawer(page);
      await midiAction(page, "Connect MIDI keyboard");
      const chordBefore = await page.locator(".hymn-count").textContent();
      await page.evaluate(() => {
        for (const p of [43, 47, 50, 55, 59, 67])
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
    console.log(`PASS O Come, All Ye Faithful editions ${width}px`);
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
