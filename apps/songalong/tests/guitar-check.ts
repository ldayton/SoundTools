import {openHymnInstrumentChoices} from "../../../packages/music-practice/browser-tests/helpers";
import {selectScoreDisplay,expectScoreDisplay} from "../../../packages/music-practice/browser-tests/helpers";
import {practiceHymn,selectSingleCapoPracticeHymn} from "../../../packages/music-practice/test-fixtures/hymns";
import { selectHymnInstrument } from '../../../packages/music-practice/browser-tests/helpers';
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { instrumentEditionIds, instrumentEdition, chordEdition } from "../../../packages/music-practice/src/instrument-editions";
import { arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import { guitarSustainAudio } from "../../../packages/music-practice/src/guitar-sustain";
import { capoAudio } from "../../../packages/music-practice/src/edition-score";
import { playbackNotes } from "../../../packages/music-practice/src/hymn-playback";
import { performNotes } from "../../../packages/music-practice/src/playback-performance";
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
  practiceOption,
} from "../../../packages/music-practice/browser-tests/helpers";
export async function checkGuitar(widths: number[], audio: boolean, port: number) {
const server = await preview("songalong", port),
  browser = await launchBrowser();
try {
  const singleCapo=await selectSingleCapoPracticeHymn();
  for (const width of widths) {
    const page = await newPage(browser, { viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const legacy of ["guitar", "guitar-chords"]) {
      await page.goto(
        server.base +
          `/piano/hymns/ill-fly-away?arrangement=${legacy}&key=D&capo=2&display=both&mode=playback`,
      );
      await page.locator(".abcjs-tabNumber").first().waitFor();
      await openPracticeOptions(page);
      await expect(page.locator('.hymn-instrument-picker, .hymn-toolbar-instruments [role="radio"][aria-checked="true"]')).toHaveAttribute('data-instrument', 'guitar');
      await expect(page.locator("#hymn-key")).toHaveValue(/D major/);
      await expect(page.locator(".hymn-score-setup")).toHaveText("Capo 2 · Sounding key: D major");
      assert(
        (await page.locator(".abcjs-chord").allTextContents()).includes("G7"),
      );
      assert(
        !(await page.locator(".abcjs-chord").allTextContents()).includes("A7"),
      );
      await selectScoreDisplay(page,"chords");
      await expect(page.locator(".hymn-strum-pattern")).toBeVisible();
      await openHymnInstrumentChoices(page);
      await expect(page.getByRole('radiogroup', { name: 'Instrument', exact: true }).getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Voice', exact: true })).toBeEnabled();
      await selectHymnInstrument(page, 'piano');
      await expect(page.locator(".abcjs-tabNumber")).toHaveCount(0);
      await selectHymnInstrument(page, 'guitar');
      await expectScoreDisplay(page,"chords");
      await dismissPracticeDrawer(page);
      await page.reload();
      await openPracticeOptions(page);
      await expectScoreDisplay(page,"chords");
      await dismissPracticeDrawer(page);
    }
    // Shared four-score control contract, independent of a named edition.
    await page.goto(`${server.base}/piano/hymns/${practiceHymn.slug}?arrangement=piano&mode=playback`);
    await expect(page.locator(".hymn-paper svg").first()).toBeVisible();await dismissPracticeDrawer(page);
    await openHymnInstrumentChoices(page);
    const voice=page.getByRole("button",{name:"Voice",exact:true}),guitar=page.getByRole("radio",{name:"Guitar",exact:true}),piano=page.getByRole("radio",{name:"Piano",exact:true});
    await voice.click();await expect(piano).toHaveAttribute("data-arrangement","original");
    await openHymnInstrumentChoices(page);
    await guitar.click();await expect(guitar).toHaveAttribute("data-arrangement","guitar-vocal");
    await expect(voice).toHaveAttribute("aria-pressed","true");await expect(piano).toHaveAttribute("aria-checked","false");
    await expect(page.locator(".hymn-paper svg").first().locator(".abcjs-clef")).toHaveCount(2);
    await openPracticeOptions(page);
    await expect(page.getByRole("checkbox",{name:"Show Voice",exact:true})).toBeChecked();
    await expect(page.getByRole("checkbox",{name:"Show Guitar",exact:true})).toBeChecked();
    await expect(page.locator("#hymn-octave-down")).toBeEnabled();
    const capoBefore=await page.locator(".hymn-score-setup").textContent();
    await page.locator("#hymn-octave-down").click();
    await expect.poll(()=>new URL(page.url()).searchParams.get("octave")).toBe("-1");
    await expect(page.locator(".hymn-score-setup")).toHaveText(capoBefore!);
    await expect(page.locator(".hymn-paper svg").first()).toBeVisible();
    await page.locator("#hymn-octave-up").click();
    await expect.poll(()=>new URL(page.url()).searchParams.get("octave")).toBe("0");
    await dismissPracticeDrawer(page);
    await openHymnInstrumentChoices(page);
    await guitar.click();await expect(guitar).toHaveAttribute("data-arrangement","guitar-vocal");
    await page.reload();await openHymnInstrumentChoices(page);await expect(guitar).toHaveAttribute("data-arrangement","guitar-vocal");
    await expect(voice).toHaveAttribute("aria-pressed","true");
    await piano.click();await expect(piano).toHaveAttribute("data-arrangement","original");
    await voice.click();await expect(piano).toHaveAttribute("data-arrangement","piano");
    await openHymnInstrumentChoices(page);
    await guitar.click();await expect(guitar).toHaveAttribute("data-arrangement","guitar-edition");
    for(const arrangement of ["guitar-edition"]){
      await page.goto(`${server.base}/piano/hymns/${singleCapo.hymn.slug}?arrangement=${arrangement}&mode=playback&key=original&octave=0`);
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-capo")).toHaveCount(0);
      await dismissPracticeDrawer(page);
      await expect(page.locator(".hymn-score-setup")).toHaveText(`Capo ${singleCapo.capo} · Sounding key: ${singleCapo.hymn.key} major`);
      await expect(page.locator(".abcjs-note").first()).toBeVisible();
      await openPracticeOptions(page);
      const phraseToggle=page.getByRole('checkbox',{name:'Show fingerings',exact:true});
      await phraseToggle.check();
      await expect(page.locator('.beginner-fingering[data-string][data-fret][data-beat]').first()).toBeVisible();
      const contacts=await page.locator('.beginner-fingering').evaluateAll(nodes=>nodes.map(n=>({finger:Number((n as HTMLElement).dataset.finger),string:Number((n as HTMLElement).dataset.string),fret:Number((n as HTMLElement).dataset.fret)})));
      assert(contacts.length>0&&contacts.every(n=>n.finger>=1&&n.finger<=4&&n.string>=1&&n.string<=6&&n.fret>0&&n.fret<=24),'Fingering marks come from complete fixed-tab phrase contacts');
      await dismissPracticeDrawer(page);

    }
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.close();
    console.log(
      `PASS Guitar legacy-link migration and independent display ${width}px`,
    );
  }
  if (audio) {
  // Real scheduling witnesses use explicit reference capos for every registry
  // entry. Automatic capo selection is owned by guitar-capo.browser.ts. Sustain math
  // has independent melody, rest, harmony, repeat and string-reuse unit goldens.
  const audioPage=await newPage(browser,{viewport:{width:1440,height:1000}});
  const audioErrors:string[]=[];audioPage.on("pageerror",e=>audioErrors.push(e.message));
  await audioPage.addInitScript(()=>{
    const state=((window as any).guitarSustainProbe={notes:[] as {when:number;end?:number}[]});
    const sources=new WeakMap<AudioBufferSourceNode,{when:number;end?:number}>();
    const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){
      if(this.context instanceof AudioContext){const note={when:args[0]||0};sources.set(this,note);state.notes.push(note);}
      return start.apply(this,args);
    };
    AudioBufferSourceNode.prototype.stop=function(...args:Parameters<typeof stop>){
      const note=sources.get(this);if(note && note.end===undefined)note.end=args[0];
      return stop.apply(this,args);
    };
  });
  for(const id of instrumentEditionIds){
    const hymn=hymns.find(h=>h.id===id)!,edition=instrumentEdition(hymn)!,capo=chordEdition(hymn)?.capo||0;
    const abc=arrangeHymn(hymn,edition.guitarArrangement,0).abc;
    const audio=capoAudio(abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true}),edition.guitarArrangement==="guitar-edition"?capo:0);
    const expected=performNotes(playbackNotes(guitarSustainAudio(audio,abc)),{instrument:"guitar",positionFor:(p,chord)=>chordEdition(hymn)?.position(p-capo,chord,0)});
    const first=Math.min(...expected.map(n=>n.start));
    const durations=expected.filter(n=>n.start===first).map(n=>n.duration*.5+.045+.01).sort((a,b)=>a-b);
    await audioPage.goto(`${server.base}/piano/hymns/${hymn.slug}?arrangement=${edition.guitarArrangement}&display=notation&mode=playback&tempo=120&countIn=0&key=original&octave=0${chordEdition(hymn)?`&capo=${capo}`:""}`);
    await expect(audioPage.locator(".hymn-paper")).not.toContainText("Let ring");
    if(capo===0)await expect(audioPage.locator(".hymn-paper")).not.toContainText("No capo");
    await expect(audioPage.locator(".abcjs-part,.abcjs-tempo,.abcjs-bar-number")).toHaveCount(0);
    if(hymn.feel==="swing"){
      const swing=audioPage.getByRole("button",{name:"Swing",exact:true});
      await swing.click();
      await expect(audioPage.getByRole("tooltip")).toContainText("Play each pair of eighth notes long–short");
      await swing.press("Escape");
      await expect(audioPage.getByRole("tooltip")).toBeHidden();
    }
    await dismissPracticeDrawer(audioPage);
    await audioPage.getByRole("button",{name:"Play",exact:true}).click();
    await audioPage.waitForFunction(count=>(window as any).guitarSustainProbe.notes.filter((n:any)=>n.end!==undefined).length>=count,durations.length);
    const actual=await audioPage.evaluate(()=>{
      const notes=(window as any).guitarSustainProbe.notes,first=Math.min(...notes.map((n:any)=>n.when));
      return notes.filter((n:any)=>Math.abs(n.when-first)<.001).map((n:any)=>n.end-n.when).sort((a:number,b:number)=>a-b);
    });
    assert.equal(actual.length,durations.length,hymn.slug);
    actual.forEach((duration:number,i:number)=>assert(Math.abs(duration-durations[i])<.015,`${hymn.slug}: scheduled ${duration}, expected ${durations[i]}`));
    await audioPage.getByRole("button",{name:"Pause",exact:true}).click();
  }
  assert.deepEqual(audioErrors,[]);await audioPage.close();
  console.log("PASS: every guitar edition hides editorial markings while preserving its sounding duration");
  }
} catch (e) {
  await captureFailure(browser, e);
  throw e;
} finally {
  await closeBrowser(browser);
  server.stop();
}

}
