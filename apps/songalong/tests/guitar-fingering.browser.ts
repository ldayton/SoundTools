import hymns from "../../../packages/music-practice/src/hymns.json";
import {instrumentEditionIds,instrumentEdition,chordEdition} from "../../../packages/music-practice/src/instrument-editions";
import {hymnTransposition} from "../../../packages/music-practice/src/hymn-transpose";
import {readFile,mkdir} from "node:fs/promises";
import {hymnKeyOptions,practiceOption,midiAction,closePracticeOptions} from "../../../packages/music-practice/browser-tests/helpers";
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
  await mkdir("work/musical-fixes",{recursive:true});
  for(const id of instrumentEditionIds){
    const hymn=hymns.find(h=>h.id===id)!, edition=instrumentEdition(hymn)!, profile=chordEdition(hymn);
    const page=await newPage(browser,{viewport:{width:1440,height:1000}});
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript({content:await readFile(new URL("../../../packages/music-practice/test-fixtures/midi.js",import.meta.url),"utf8")});
    await page.goto(`${server.base}/piano/hymns/${hymn.slug}?arrangement=${edition.guitarArrangement}&display=both&mode=playback&key=original&octave=0`);
    await expect(page.locator(".abcjs-tabNumber").first()).toBeVisible();
    const frets=await page.locator(".abcjs-tabNumber").allTextContents();
    const chords=await page.getByRole("button",{name:/^Show .* chord diagram$/}).allTextContents();
    const keys=await hymnKeyOptions(page);
    assert.equal(keys.length,13);assert(keys.every(k=>!k.disabled),`${hymn.slug}: every key is selectable`);
    const target=hymn.key === "D" ? "E" : "D";
    await practiceOption(page,"#hymn-key",target);
    if(profile){
      const capo=(profile.capo+hymnTransposition(hymn.key,target).semitones+12)%12;
      await expect(page.locator("#hymn-capo")).toHaveValue(String(capo));
      const suggestions=await page.locator("#hymn-capo option").allTextContents();assert(suggestions.length>=1&&suggestions.length<=3);assert.equal(suggestions.filter(s=>s.includes("recommended")).length,1);
      await expect(page.locator(".hymn-score-setup")).toHaveText(`${capo ? `Capo ${capo}` : "No capo"} · Sounding key: ${target} major`);
      assert.deepEqual(await page.locator(".abcjs-tabNumber").allTextContents(),frets,`${hymn.slug}: capo transposition retains playable frets`);
      assert.deepEqual(await page.getByRole("button",{name:/^Show .* chord diagram$/}).allTextContents(),chords);
    }
    if(!profile)await expect(page.locator("#hymn-capo")).toHaveCount(0);
    if(hymn.slug === "ill-fly-away"){
      await page.locator(".hymn-score-setup").scrollIntoViewIfNeeded();
      await page.screenshot({path:"work/musical-fixes/ill-fly-away-d-desktop.png"});
      // Actual MIDI grading must move with the capo, including all chord notes.
      await practiceOption(page,"#hymn-mode","wait");
      await closePracticeOptions(page);await midiAction(page,"Connect MIDI keyboard");
      await page.getByText("GO:KEYS 5 connected. Play at your own pace.",{exact:true}).waitFor();
      const before=await page.locator(".hymn-count").textContent();
      await page.evaluate(()=>(window as any).midiTest.send([0x90,50,100]));
      await page.evaluate(()=>{for(const n of [54,66])(window as any).midiTest.send([0x90,n,100]);});
      await expect(page.locator(".hymn-count")).not.toHaveText(before!);
      await page.evaluate(()=>{for(const n of [50,54,66])(window as any).midiTest.send([0x80,n,0]);});
      for(const [hands,pitches]of [["right",[66]],["left",[50,54,57,62,66]]] as const){
        await practiceOption(page,"#hymn-hands",hands);await closePracticeOptions(page);
        const beforeHand=await page.locator(".hymn-count").textContent();
        await page.evaluate(ns=>{for(const n of ns)(window as any).midiTest.send([0x90,n,100]);},[...pitches]);
        await expect(page.locator(".hymn-count")).not.toHaveText(beforeHand!);
        await page.evaluate(ns=>{for(const n of ns)(window as any).midiTest.send([0x80,n,0]);},[...pitches]);
      }
      await page.reload();await expect(page.locator(".hymn-score-setup")).toHaveText("Capo 2 · Sounding key: D major");
    }
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS ${hymn.slug}: key selection, capo/position and score agreement`);
  }
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
    await page.locator(".abcjs-tabNumber").first().waitFor();
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
