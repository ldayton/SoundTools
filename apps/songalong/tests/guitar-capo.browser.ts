import {openHymnInstrumentChoices} from "../../../packages/music-practice/browser-tests/helpers";
import assert from "node:assert/strict";
import {expect} from "@playwright/test";
import {readFile,mkdir} from "node:fs/promises";
import {launchBrowser,newPage,closeBrowser,captureFailure,waitForApp} from "../../../scripts/ci/browser-harness.cjs";
import {preview} from "../../../packages/music-practice/browser-tests/server";
import {practiceOption,openPracticeOptions,closePracticeOptions,midiAction,selectHymnInstrument} from "../../../packages/music-practice/browser-tests/helpers";
import {selectCapoPracticeHymn} from "../../../packages/music-practice/test-fixtures/hymns";
const fixture=await selectCapoPracticeHymn(),server=await preview("songalong",4697),browser=await launchBrowser();
try{
 await mkdir("work/capo/screenshots",{recursive:true});
 for(const width of [1440,393]){
  const page=await newPage(browser,{viewport:{width,height:1000},reducedMotion:"reduce"});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript({content:await readFile(new URL("../../../packages/music-practice/test-fixtures/midi.js",import.meta.url),"utf8")});
  await page.goto(`${server.base}/piano/hymns/${fixture.hymn.slug}?arrangement=guitar-edition&mode=playback&display=both&key=original&octave=0`);
  await waitForApp(page, ".hymn-controls");
  await expect(page.locator(".abcjs-tabNumber").first()).toBeVisible();await openPracticeOptions(page);
  await expect(page.locator("#hymn-capo")).toHaveValue(String(fixture.recommended.fret));
  await expect(page.locator("#hymn-capo")).not.toContainText("score setting");
  const sourceFrets=await page.locator(".abcjs-tabNumber").allTextContents();
  const shape=fixture.alternate.shapeKey.replaceAll("#","♯").replaceAll("b","♭");
  await practiceOption(page,"#hymn-capo",String(fixture.alternate.fret));
  await expect(page.locator(".hymn-score-setup")).toHaveText(`${fixture.alternate.fret ? `Capo ${fixture.alternate.fret} · ` : ""}Sounding key: ${fixture.hymn.key} major`);
  await expect(page.locator('input[name="hymn-key"]')).toHaveValue("original");
  assert.notDeepEqual(await page.locator(".abcjs-tabNumber").allTextContents(),sourceFrets);
  await expect(page.locator("#hymn-capo option:checked")).toContainText(`${shape} shapes`);
  assert.equal(new URL(page.url()).searchParams.get("capo"),String(fixture.alternate.fret));
  // Tempo-aware ranking must preserve an explicit playable capo and sounding key.
  await practiceOption(page,"#hymn-tempo","110");
  await openPracticeOptions(page);
  await expect(page.locator("#hymn-capo")).toHaveValue(String(fixture.alternate.fret));
  await expect(page.locator(".hymn-score-setup")).toHaveText(`${fixture.alternate.fret ? `Capo ${fixture.alternate.fret} · ` : ""}Sounding key: ${fixture.hymn.key} major`);
  await page.screenshot({path:`work/capo/screenshots/capo-options-${width}.png`});
  const narrowScore=await page.locator(".abcjs-tabNumber").first().elementHandle();
  await closePracticeOptions(page);
  if(width>=1120)await narrowScore!.waitForElementState("hidden");
  await expect(page.locator(".hymn-score-setup")).toBeVisible();
  await page.screenshot({path:`work/capo/screenshots/capo-score-${width}.png`});
  const chord=fixture.alternate.chords[0].replaceAll("#","♯").replaceAll("b","♭");
  await page.getByRole("button",{name:`Show ${chord} chord diagram`,exact:true}).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();if(fixture.alternate.fret)await expect(page.getByRole("dialog")).toContainText(`Capo ${fixture.alternate.fret}`);
  await page.getByRole("button",{name:"Close chord diagram",exact:true}).click();await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();await openPracticeOptions(page);await expect(page.locator("#hymn-capo")).toHaveValue(String(fixture.alternate.fret));
  await selectHymnInstrument(page,"piano");await expect(page.locator("#hymn-capo")).toHaveCount(0);
  await selectHymnInstrument(page,"guitar");await expect(page.locator("#hymn-capo")).toHaveValue(String(fixture.alternate.fret));
  if(width===1440){
   await closePracticeOptions(page);
   await page.getByRole("button",{name:"Play",exact:true}).click();
   await expect(page.getByRole("button",{name:"Pause",exact:true})).toBeVisible();
   const playingFrets=await page.locator(".abcjs-tabNumber").allTextContents();
   await practiceOption(page,"#hymn-tempo","120");
   await expect(page.getByRole("button",{name:"Pause",exact:true})).toBeVisible();
   assert.deepEqual(await page.locator(".abcjs-tabNumber").allTextContents(),playingFrets,"Tempo changes keep the active fingering stable");
   await page.getByRole("button",{name:"Pause",exact:true}).click();
   await openPracticeOptions(page);
   await expect(page.locator("#hymn-capo")).toHaveValue(String(fixture.alternate.fret));
   await practiceOption(page,"#hymn-mode","wait");await practiceOption(page,"#hymn-hands","both");await closePracticeOptions(page);
   await midiAction(page,"Connect MIDI keyboard");await page.getByText("GO:KEYS 5 connected. Play at your own pace.",{exact:true}).waitFor();
   const before=await page.locator(".hymn-count").textContent();
   await page.evaluate(ns=>{for(const n of ns)(window as any).midiTest.send([0x90,n,100]);},fixture.first);
   await expect(page.locator(".hymn-count")).not.toHaveText(before!);
   await page.evaluate(ns=>{for(const n of ns)(window as any).midiTest.send([0x80,n,0]);},fixture.first);
   await practiceOption(page,"#hymn-hands","left");await closePracticeOptions(page);
   const beforeChord=await page.locator(".hymn-count").textContent(),firstVoicing=[...fixture.alternate.voicings.values()][0];
   const pitches=firstVoicing.notes.map(n=>n.midi+fixture.alternate.fret);
   await page.evaluate(ns=>{for(const n of ns)(window as any).midiTest.send([0x90,n,100]);},pitches);
   await expect(page.locator(".hymn-count")).not.toHaveText(beforeChord!);
   await page.evaluate(ns=>{for(const n of ns)(window as any).midiTest.send([0x80,n,0]);},pitches);
   await openHymnInstrumentChoices(page);
   await page.getByRole("button",{name:"Voice",exact:true}).click();
   await expect(page.getByRole("radio",{name:"Guitar",exact:true})).toHaveAttribute("data-arrangement","guitar-vocal");
   await practiceOption(page,"#hymn-hands","right");await closePracticeOptions(page);
   const beforeVoice=await page.locator(".hymn-count").textContent();
   await page.evaluate(n=>(window as any).midiTest.send([0x90,n,100]),fixture.firstVocal);
   await expect(page.locator(".hymn-count")).not.toHaveText(beforeVoice!);
   await page.evaluate(n=>(window as any).midiTest.send([0x80,n,0]),fixture.firstVocal);
   await practiceOption(page,"#hymn-hands","left");await closePracticeOptions(page);
   const beforeAccompaniment=await page.locator(".hymn-count").textContent();
   await page.evaluate(ns=>{for(const n of ns)(window as any).midiTest.send([0x90,n,100]);},pitches);
   await expect(page.locator(".hymn-count")).not.toHaveText(beforeAccompaniment!);
   await page.evaluate(ns=>{for(const n of ns)(window as any).midiTest.send([0x80,n,0]);},pitches);

  }
  assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
  console.log(`PASS ${width}px: recommended capo, fixed sounding key, alternate tab, diagram, reload and instrument persistence`);
 }
}catch(e){await captureFailure(browser,e);throw e;}finally{await closeBrowser(browser);server.stop();}
