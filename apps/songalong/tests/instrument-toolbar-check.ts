import {selectHymnScore} from "../../../packages/music-practice/browser-tests/helpers";
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
  openPracticeOptions,
} from "../../../packages/music-practice/browser-tests/helpers";
import { practiceHymn } from "../../../packages/music-practice/test-fixtures/hymns";
export async function checkInstrumentToolbar(widths:number[], desktopDetails:boolean) {
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || (desktopDetails?4613:4699)),
);
const browser = await launchBrowser();
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
  });
  await page.addInitScript(() => {
    (window as any).organVoices = [];
    (window as any).choirVoices = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      if (this.context instanceof AudioContext && this.loop)
        (window as any).organVoices.push({
          buffer: this.buffer,
          loopStart: this.loopStart,
          loopEnd: this.loopEnd,
          rate: this.playbackRate.value,
          when: args[0] || 0,
        });
      if (
        this.context instanceof AudioContext &&
        !this.loop &&
        this.buffer &&
        this.buffer.duration > 2
      )
        (window as any).choirVoices.push(this.buffer);
      return start.apply(this, args);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(
      `${server.base}/piano/hymns/${practiceHymn.slug}?mode=playback&arrangement=piano`,
    );
    await waitForApp(page, ".hymn-controls");
    await dismissPracticeDrawer(page);
    await expect(page.locator(".hymn-paper svg").first()).toBeVisible();
    const headers=await page.locator(".hymn-paper svg").evaluateAll(svgs=>svgs.map(svg=>({clefs:svg.querySelectorAll('.abcjs-clef').length,keys:svg.querySelectorAll('.abcjs-key-signature').length})));
    assert(headers.length>1,"Signature regression covers multiple reflowed systems");
    assert(headers[0].clefs>0,"Opening clefs remain visible");
    assert(headers.slice(1).every(header=>header.clefs===0&&header.keys===0),"Unchanged clefs and keys do not repeat after reflow");
    if (width < 768) {
      await expect(page.locator(".hymn-controls-toggle")).toHaveCount(0);
      const primary=page.getByRole("group",{name:"Playback and sound",exact:true});
      const primaryBox=await primary.boundingBox();
      assert(primaryBox && Math.abs(primaryBox.x+primaryBox.width/2-width/2)<=1,"Main controls stay centered between the edge expanders");
      const mainButtons=await primary.locator("button").evaluateAll(buttons=>buttons.map(button=>{const {width,height}=button.getBoundingClientRect();return {width,height};}));
      assert.equal(mainButtons.length,4);
      assert(mainButtons.every(box=>box.width===44 && box.height===44),"Playback and sound buttons share square finger-sized targets");
      await expect(page.locator(".mantine-AppShell-header #hymn-tempo")).toHaveCount(0);
      await openPracticeOptions(page);
      const options=page.locator("#practice-options-content");
      await expect(options.locator("#hymn-tempo")).toBeEnabled();
      await expect(options.getByRole("checkbox", {name:"Show fingerings",exact:true})).toBeVisible();
      await expect(options.locator("#hymn-size")).toBeVisible();
      await expect(options.locator("#hymn-staff-spacing")).toBeVisible();
      await options.locator("#hymn-tempo").fill("94");
      await options.locator("#hymn-tempo").press("Enter");
      await expect(options.locator("#hymn-tempo")).toHaveValue("94 BPM");
      await dismissPracticeDrawer(page);
      await openPracticeOptions(page);
      await expect(options.locator("#hymn-tempo")).toHaveValue("94 BPM");
      await dismissPracticeDrawer(page);
    }
    const picker=page.getByRole("button",{name:"Choose instrument",exact:true});
    if(width<768){await expect(picker.locator("svg")).toHaveCount(1);await picker.click();}
    const group = page.getByRole("group", {
      name: "Instruments and voice",
      exact: true,
    });
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(
      page.getByRole("radio", { name: "Guitar", exact: true }),
    ).toBeEnabled();
    const piano = page.getByRole("radio", { name: "Piano", exact: true }),
      sung = page.getByRole("button", {
        name: "Voice",
        exact: true,
      });
    await expect(piano).toHaveAttribute("aria-checked", "true");
    assert.equal(
      await (width<768?picker:group).evaluate((el) => !!el.closest(".mantine-AppShell-header")),
      true,
    );
    await expect
      .poll(() =>
        (width<768?picker:group).evaluate((el) => {
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
    if (width >= 768) {
      assert(await group.evaluate(el => !!el.closest(".hymn-toolbar-playback")));
      const selectorBox=await group.boundingBox(), startBox=await page.getByRole("button",{name:"Go to start",exact:true}).boundingBox();
      assert(selectorBox && startBox && selectorBox.x+selectorBox.width<=startBox.x,"Instruments sit immediately left of transport");
    }
    const boxes = await group
      .locator("button")
      .evaluateAll((elements) =>
        elements.map((el) => el.getBoundingClientRect().toJSON()),
      );
    assert.ok(boxes.every((b) => Math.abs(b.top - boxes[0].top) < 1));
    assert.ok(
      boxes[0].right <= boxes[1].left + 1 &&
        boxes[1].right <= boxes[2].left + 1,
    );
    const keyboard=page.getByRole("button",{name:"On-screen piano",exact:true});
    const toolbarGeometry=()=>page.locator(width<768?".hymn-instrument-picker,.hymn-go-start,.hymn-pause,#practice-options-reopen":".hymn-toolbar-instruments,.hymn-go-start,.hymn-pause,.hymn-keyboard-toggle").evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).map(el=>{
      const {x,y,width,height}=el.getBoundingClientRect();return {x,y,width,height};
    }));
    if(width>=768){await expect(keyboard).toBeVisible();await expect(keyboard).toBeEnabled();}
    else await expect(keyboard).toHaveCount(0);
    await page.evaluate(()=>document.fonts.ready);
    const initialToolbar=await toolbarGeometry();
    const checkToolbar=async()=>{
      const actual=await toolbarGeometry();assert.equal(actual.length,initialToolbar.length,"Instrument switches keep the same toolbar controls");
      actual.forEach((box,index)=>{for(const axis of ["x","y","width","height"] as const)assert(Math.abs(box[axis]-initialToolbar[index][axis])<=1,`Toolbar ${axis} shifts when switching instruments at ${width}px`);});
    };
    await piano.focus();
    await piano.press("ArrowRight");
    await expect(page.getByRole("radio",{name:"Guitar",exact:true})).toHaveAttribute("aria-checked","true");
    await expect(sung).toHaveAttribute("aria-pressed","false");
    await checkToolbar();
    if(width>=768){
      await expect(keyboard).toBeVisible();await expect(keyboard).toBeEnabled();
      await keyboard.click();await expect(page.locator(".practice-piano")).toBeHidden();
      await expect(keyboard).toHaveAttribute("aria-expanded","false");await checkToolbar();
    }
    await sung.click();
    await expect(page.getByRole('radio',{name:'Guitar',exact:true})).toHaveAttribute("data-arrangement","guitar-vocal");
    await expect(page.locator(".hymn-paper svg").first().locator(".abcjs-clef")).toHaveCount(2);
    await checkToolbar();
    if(width>=768){
      await expect(page.locator(".practice-piano")).toBeHidden();
      await keyboard.click();await expect(page.locator(".practice-piano")).toBeVisible();
      await expect(keyboard).toHaveAttribute("aria-expanded","true");await checkToolbar();
    }
    await page.screenshot({path:`/tmp/songalong-voice-combo-${width}.png`});
    await piano.click();
    await expect(piano).toHaveAttribute("data-arrangement","original");
    await expect(sung).toHaveAttribute("aria-pressed", "true");
    await checkToolbar();
    if(width>=768)await expect(page.locator(".practice-piano")).toBeVisible();
    await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);
    await expect(page.locator("#hymn-arrangement")).toHaveCount(0);
    await expect(page.locator("#saved")).toHaveText("Saved on this device.");
    await page.reload();
    await waitForApp(page, ".hymn-controls");
    if(width<768)await picker.click();
    await expect(sung).toHaveAttribute("aria-pressed", "true");
    // The saved instrument also survives navigating to a clean song link.
    await page.goto(
      `${server.base}/piano/hymns/${practiceHymn.slug}?mode=playback`,
    );
    await waitForApp(page, ".hymn-controls");
    if(width<768)await picker.click();
    await expect(sung).toHaveAttribute("aria-pressed", "true");
    await openPracticeOptions(page);
    await page.getByRole("checkbox",{name:"Show Voice",exact:true}).uncheck();
    await page.getByRole("checkbox",{name:"Play Voice",exact:true}).uncheck();
    await selectHymnInstrument(page,"guitar");await selectHymnInstrument(page,"sung");await openPracticeOptions(page);
    await expect(page.getByRole("checkbox",{name:"Show Voice",exact:true})).not.toBeChecked();
    await expect(page.getByRole("checkbox",{name:"Play Voice",exact:true})).not.toBeChecked();
    await page.locator("#hymn-key").click();
    const keyMenu=page.getByRole("listbox",{name:"Key",exact:true});
    await expect(keyMenu.getByRole("option")).toHaveCount(12);
    await expect(keyMenu.locator(`[role="option"][value="${practiceHymn.key}"]`)).toHaveCount(0);
    await expect(keyMenu.locator('[role="option"][value="original"]')).toBeVisible();
    await page.locator("#hymn-key").press("Escape");
    await selectHymnInstrument(page, "piano");
    await selectHymnScore(page, "piano");
    await checkToolbar();
    if(width<768)await expect(picker).toHaveAttribute("data-arrangement","piano");
    else await expect(piano).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#hymn-arrangement")).toHaveCount(0);
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
  if(desktopDetails){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.base + "/piano/hymns/in-christ-alone?mode=playback");
  await waitForApp(page, ".hymn-controls");
  await expect(
    page.getByRole("button", { name: "Voice", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("radio", { name: "Piano", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("radio", { name: "Guitar", exact: true }),
  ).toBeEnabled();
  const slash = page
    .getByRole("button", { name: /Show D\/F[♯#] chord diagram/ })
    .first();
  await slash.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".piano-chord-notes")).toHaveText(
    "F♯3 · A3 · D4",
  );
  await expect(dialog.locator(".is-playing")).toHaveCount(3);
  await expect(dialog.locator("[data-string]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(slash).toBeFocused();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => (window as any).organVoices.length > 0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const choirLevel = await page.evaluate(() => {
    const buffer = (window as any).choirVoices[0];
    if (!buffer)
      throw Error("Choir staff did not schedule its human vowel sample");
    const from = Math.round(0.25 * buffer.sampleRate),
      to = Math.round(2.25 * buffer.sampleRate);
    let sum = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = from; i < to; i++) sum += data[i] * data[i];
    }
    return (
      20 * Math.log10(Math.sqrt(sum / ((to - from) * buffer.numberOfChannels)))
    );
  });
  assert.ok(
    Math.abs(choirLevel - -26) < 0.15,
    `normalized choir sustain: ${choirLevel}`,
  );
  const organ = await page.evaluate(async () => {
    const note = (window as any).organVoices[0];
    const pcm = note.buffer.getChannelData(0),
      rate = note.buffer.sampleRate;
    const from = Math.round(note.loopStart * rate),
      to = Math.round(note.loopEnd * rate);
    let energy = 0;
    for (let i = from; i < to; i++) energy += pcm[i] * pcm[i];
    const ctx = new OfflineAudioContext(1, 24000 * 12, 24000);
    const source = ctx.createBufferSource();
    source.buffer = note.buffer;
    source.loop = true;
    source.loopStart = note.loopStart;
    source.loopEnd = note.loopEnd;
    source.playbackRate.value = note.rate;
    source.connect(ctx.destination);
    source.start(0);
    source.stop(12);
    const data = (await ctx.startRendering()).getChannelData(0);
    let tail = 0,
      peak = 0;
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
      if (i >= 24000 * 11) tail += data[i] * data[i];
    }
    return {
      rmsDb: 20 * Math.log10(Math.sqrt(energy / (to - from))),
      tailRms: Math.sqrt(tail / 24000),
      peak,
    };
  });
  assert.ok(
    Math.abs(organ.rmsDb - -26) < 0.1,
    `normalized organ sustain: ${organ.rmsDb}`,
  );
  assert.ok(
    organ.tailRms > 0.01,
    "held organ note survives past the recorded sample end",
  );
  assert.ok(organ.peak < 0.502, "organ sample peak has headroom");
  // A pre-UUID guest save must survive a public deep link and a cold reload.
  const migratedPage = await newPage(browser, {viewport:{width:1440,height:1000}});
  migratedPage.on("pageerror", e => errors.push(e.message));
  await migratedPage.addInitScript(({slug}) => {
    localStorage.setItem("soundtools:songalong:sight-reading:v1", JSON.stringify({
      version:1,catalogueRevision:1,hymn:slug,arrangement:"melody",mode:"playback",bpm:93,
      preferences:{[slug]:{hymn:slug,arrangement:"melody",bpm:93}},
      favorites:{[slug]:true},bookmarks:{},sections:{},
    }));
  },{slug:practiceHymn.slug});
  await migratedPage.goto(`${server.base}/piano/hymns/${practiceHymn.id}`);
  await waitForApp(migratedPage, ".hymn-controls");
  await expect(migratedPage).toHaveURL(new RegExp(`/piano/hymns/${practiceHymn.slug}\\?`));
  await expect(migratedPage.locator("#hymn-tempo")).toHaveValue("93 BPM");
  await expect(migratedPage.locator(".hymn-favorite")).toHaveAttribute("aria-pressed","true");
  await practiceOption(migratedPage,"#hymn-tempo","94");
  await expect(migratedPage.locator("#saved")).toHaveText("Saved on this device.");
  const stored = await migratedPage.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve,reject) => {
      const request=indexedDB.open("soundtools-songalong",1);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const value = await new Promise<any>((resolve,reject) => {
      const request=db.transaction("state").objectStore("state").get("root");
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    db.close();return value.state.activities.sight;
  });
  assert.equal(stored.hymn,practiceHymn.id);
  assert.equal(stored.catalogueRevision,4);
  assert.equal(stored.preferences[practiceHymn.id].bpm,94);
  assert.equal(stored.preferences[practiceHymn.slug],undefined);
  assert.equal(stored.favorites[practiceHymn.id],true);
  await migratedPage.reload();
  await waitForApp(migratedPage, ".hymn-controls");
  await expect(migratedPage.locator("#hymn-tempo")).toHaveValue("94 BPM");
  await expect(migratedPage.locator(".hymn-favorite")).toHaveAttribute("aria-pressed","true");
  await migratedPage.close();
  // A presentation preference is global, initially off, and survives reload.
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.getByRole("spinbutton",{name:"Staff spacing",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Adjust staff spacing",exact:true})).toHaveCount(0);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: primary instrument radios, supported choices, stable piano toggle, saved selection and responsive toolbar",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}

}
