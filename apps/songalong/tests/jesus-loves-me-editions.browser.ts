import {selectScoreDisplay,expectScoreDisplay} from "../../../packages/music-practice/browser-tests/helpers";
import {checkVocalEdition} from "../../../packages/music-practice/test-fixtures/song-edition.browser";
import { openHymnInstrumentChoices, selectHymnInstrument } from '../../../packages/music-practice/browser-tests/helpers';
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import {
  waitForApp,
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
          ".abcjs-lyric,.abcjs-tabNumber,.beginner-fingering,.abcjs-part,.abcjs-bar-number,.tab-rhythm,.hymn-lyric-extender",
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
  const collisions=await page.locator(".hymn-paper svg").evaluateAll(svgs=>svgs.flatMap(svg=>{
    const words=[...svg.querySelectorAll(".abcjs-lyric tspan")].filter(n=>n.textContent?.trim()).map(n=>n.getBoundingClientRect());
    return [...svg.querySelectorAll(".hymn-lyric-extender rect")].flatMap(n=>{
      const a=n.getBoundingClientRect();
      return words.some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)?[n.parentElement?.getAttribute("data-syllable")]:[];
    });
  }));
  assert.deepEqual(collisions,[],"Melisma lines clear Hebrew letters and niqqud");
  assert(
    await page
      .locator(".hymn-paper svg")
      .evaluateAll((nodes) =>
        nodes.every((n) => (n as SVGSVGElement).viewBox.baseVal.height < 600),
      ),
    "Every system fits its music without blank lyric boxes stretching the ending",
  );
}
const server = await preview("songalong", 4605),
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
        "/piano/hymns/jesus-loves-me?arrangement=piano&mode=playback",
    );
    await page.locator(".abcjs-note").first().waitFor();
    await openHymnControls(page);
    await page
      .getByRole("checkbox", { name: "Show fingerings", exact: true })
      .check();
    await expect(page.locator(".beginner-fingering").first()).toBeVisible();
    await expect(page.locator("g.abcjs-part")).toHaveCount(0);
    assert(await page.locator(".hymn-paper svg").evaluateAll(svgs=>svgs.some(svg=>svg.querySelector(".abcjs-note.abcjs-v0")?.classList.contains("abcjs-mm8"))), "Refrain still starts a fresh system without its label");
    await checkScore(page);
    await openPracticeOptions(page);
  await expect(page.getByRole('table', { name: 'Playback staves' }).getByRole('columnheader')).toHaveText(['Staff', 'Show', 'Play']);
    await openHymnInstrumentChoices(page);
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
      await expect(page.locator(".hymn-score-setup")).toContainText("Capo 1");
      if (display === "tab") {
        await expect(page.locator(".tab-rhythm-dot").first()).toBeVisible();
        assert(await page.locator(".tab-rhythm-half").count());
        assert(await page.locator(".tab-rhythm-dot").count());
        await expect(page.locator(".tab-rhythm-continuation")).toHaveCount(0);

        await expect(page.locator(".tab-rhythm-time")).toHaveText(["4", "4"]);
        assert(
          (await page.locator(".abcjs-lyric").allTextContents())
            .join(" ")
            .includes("loves"),
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
    await expect(stanzas).toHaveCount(4);
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
        .includes("stay"),
    );
    await stanzas.nth(0).check();
    await stanzas.nth(2).uncheck();
    await selectScoreDisplay(page,"tab");
    await page.reload();
    await openPracticeOptions(page);
    await expect(page.locator('.hymn-instrument-picker, .hymn-toolbar-instruments [role="radio"][aria-checked="true"]')).toHaveAttribute('data-instrument', 'guitar');
    await expectScoreDisplay(page,"tab");
    await dismissPracticeDrawer(page);
    if (width === 1440) {
      await page.goto(
        server.base +
          "/piano/hymns/jesus-loves-me?arrangement=guitar-edition&display=both&mode=wait&capo=3",
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
        for (const p of [51, 58]) (window as any).midiTest.send([0x90, p, 90]);
      });
      await expect(page.locator(".hymn-count")).not.toHaveText(before!);
      await page.evaluate(() => {
        for (const p of [51, 58]) (window as any).midiTest.send([0x80, p, 0]);
      });
      await openPracticeOptions(page);
      await page.locator("#hymn-hands").selectOption("left");
      await selectScoreDisplay(page,"chords");
      await page.reload();
      await page.locator(".hymn-paper svg").first().waitFor();
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-hands")).toHaveValue("left");
      await expectScoreDisplay(page,"chords");
      await dismissPracticeDrawer(page);
      await midiAction(page, "Connect MIDI keyboard");
      const chordBefore = await page.locator(".hymn-count").textContent();
      await page.evaluate(() => {
        for (const p of [51, 55, 58, 63, 67])
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
    // Translations mix with English, and each language prints its refrain once.
    for(const arrangement of ["piano","guitar-edition"]){
      await page.goto(`${server.base}/piano/hymns/jesus-loves-me?arrangement=${arrangement}&mode=playback&display=both&stanzas=1,2,3,4&capo=3`);
      await waitForApp(page,".hymn-pause");
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-stanzas input:checked")).toHaveCount(4);
      for(const label of ["אני יקר לישוע"])
        await expect(page.getByRole("checkbox",{name:label,exact:true})).toBeChecked();
      await expect(page.locator(".hymn-paper")).toContainText("מוּ");
      await expect(page.locator(".hymn-paper")).toContainText("תָּ");
      await checkScore(page);
      if(arrangement==="guitar-edition")for(const display of ["tab","chords","both"]){
        await selectScoreDisplay(page,display);
        await expectScoreDisplay(page,display);
        await checkScore(page);
      }
      await dismissPracticeDrawer(page);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Hebrew does not overflow the page");
      if(width===1440||width===390){
        await mkdir("work/song-support/screenshots",{recursive:true});
        await page.screenshot({path:`work/song-support/screenshots/jesus-hebrew-${arrangement}-${width}.png`,fullPage:true});
      }
      // Persist a freely mixed subset across reload.
      await openPracticeOptions(page);
      for(const index of [1,2])await page.locator("#hymn-stanzas input").nth(index).uncheck();
      await page.reload();
      await waitForApp(page,".hymn-pause");
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-stanzas input")).toHaveCount(4);
      assert.deepEqual(await page.locator("#hymn-stanzas input").evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).checked)),[true,false,false,true]);
      await checkScore(page);
      if(width===1440||width===390)for(const stanza of [4]){
        await page.goto(`${server.base}/piano/hymns/jesus-loves-me?arrangement=${arrangement}&mode=wait&hands=right&view=right&stanzas=${stanza}&capo=3`);
        await waitForApp(page,".hymn-pause");
        await expect(page.locator(".hymn-count")).toHaveText(`1 / 51`);
      }
    }
    await checkVocalEdition(page,server.base,"jesus-loves-me");
    await page.close();
    console.log(`PASS Jesus Loves Me editions ${width}px`);
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
