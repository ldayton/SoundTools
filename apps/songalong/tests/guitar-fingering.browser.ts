import hymns from "../../../packages/music-practice/src/hymns.json";
import {instrumentEditionIds,instrumentEdition,chordEdition} from "../../../packages/music-practice/src/instrument-editions";
import {hymnTransposition} from "../../../packages/music-practice/src/hymn-transpose";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
import {recommendGuitarCapos} from "../../../packages/music-practice/src/guitar-capo";
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
    const keys=await hymnKeyOptions(page);
    assert.equal(keys.length,12);assert(keys.every(k=>!k.disabled),`${hymn.slug}: every key is selectable`);
    const target=hymn.key === "D" ? "E" : "D";
    await practiceOption(page,"#hymn-key",target);
    if(profile){
      // Key selection keeps the solo register within its legal capo octave.
      const referenceCapo=(profile.capo+hymnTransposition(hymn.key,target).semitones+12)%12;
      const shift=referenceCapo-profile.capo;
      const choices=recommendGuitarCapos({abc:arrangeHymn(hymn,"guitar-edition",0).abc,accompanimentAbc:arrangeHymn(hymn,"guitar-edition",0,0,"left").abc,sourceCapo:profile.capo,transpose:shift,shapeKey:profile.guitarKey||hymn.key,positionFor:profile.position});
      const capo=choices[0].fret;
      if(choices.length>1){
        await expect(page.locator("#hymn-capo")).toHaveValue(String(capo));
        const suggestions=await page.locator("#hymn-capo option").allTextContents();assert.equal(suggestions.length,choices.length);assert(suggestions.length<=3);assert.equal(suggestions.filter(s=>s.includes("recommended")).length,1);
      }else await expect(page.locator("#hymn-capo")).toHaveCount(0);
      await expect(page.locator(".hymn-score-setup")).toHaveText(`${capo ? `Capo ${capo}` : "No capo"} · Sounding key: ${target} major`);
      const labels=await page.getByRole("button",{name:/^Show .* chord diagram$/}).allTextContents();
      for(const chord of choices[0].chords)assert(labels.some(label=>label.includes(chord.replaceAll("#","♯").replaceAll("b","♭"))),`${hymn.slug}: recommended chord family is rendered`);
    }
    if(!profile)await expect(page.locator("#hymn-capo")).toHaveCount(0);
    const voice=page.getByRole("button",{name:"Voice",exact:true});
    if(profile){
      await closePracticeOptions(page);await voice.click();
      await expect(page.getByRole("radio",{name:"Guitar",exact:true})).toHaveAttribute("data-arrangement","guitar-vocal");
      await expect(page.locator(".hymn-paper svg").first().locator(".abcjs-clef")).toHaveCount(2);
      await expect(voice).toHaveAttribute("aria-pressed","true");
      await voice.click();await expect(page.locator(".abcjs-tabNumber").first()).toBeVisible();
    }else await expect(voice).toBeDisabled();

    if(hymn.slug === "ill-fly-away"){
      await page.locator(".hymn-score-setup").scrollIntoViewIfNeeded();
      await page.screenshot({path:"work/musical-fixes/ill-fly-away-d-desktop.png"});
      // This witness owns the reviewed C-family transposition and its exact MIDI
      // chord. The loop above owns automatic engine selection in each key.
      await page.goto(`${server.base}/piano/hymns/${hymn.slug}?arrangement=guitar-edition&display=both&mode=playback&key=D&octave=0&capo=2`);
      await expect(page.locator(".hymn-score-setup")).toHaveText("Capo 2 · Sounding key: D major");
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
        "/piano/hymns/ill-fly-away?arrangement=guitar-edition&display=both&mode=playback&capo=0",
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
