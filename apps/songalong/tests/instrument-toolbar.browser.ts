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
import { stagedHymn, guitarEditionHymn } from "../../../packages/music-practice/test-fixtures/hymns";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4613),
);
const browser = await launchBrowser();
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
  });
  await page.addInitScript(() => {
    (window as any).chordPreviewAttacks = [];
    (window as any).organVoices = [];
    (window as any).choirVoices = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      if (this.context instanceof AudioContext && !this.loop) (window as any).chordPreviewAttacks.push(args[0]||0);
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
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(
      `${server.base}/piano/hymns/${stagedHymn.id}?mode=playback&arrangement=chords`,
    );
    await waitForApp(page, ".hymn-toolbar-instruments");
    await dismissPracticeDrawer(page);
    const group = page.getByRole("radiogroup", {
      name: "Instrument",
      exact: true,
    });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(
      page.getByRole("radio", { name: "Guitar", exact: true }),
    ).toBeDisabled();
    const piano = page.getByRole("radio", { name: "Piano", exact: true }),
      sung = page.getByRole("radio", {
        name: "Voice + Piano",
        exact: true,
      });
    await expect(piano).toHaveAttribute("aria-checked", "true");
    assert.equal(
      await group.evaluate((el) => !!el.closest(".mantine-AppShell-header")),
      true,
    );
    await expect
      .poll(() =>
        group.evaluate((el) => {
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
      .getByRole("radio")
      .evaluateAll((elements) =>
        elements.map((el) => el.getBoundingClientRect().toJSON()),
      );
    assert.ok(boxes.every((b) => Math.abs(b.top - boxes[0].top) < 1));
    assert.ok(
      boxes[0].right <= boxes[1].left + 1 &&
        boxes[1].right <= boxes[2].left + 1,
    );
    await piano.focus();
    await piano.press("ArrowRight");
    await expect(sung).toHaveAttribute("aria-checked", "true");
    await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);
    await expect(page.locator("#hymn-arrangement")).toHaveCount(0);
    await expect(page.locator("#saved")).toHaveText("Saved on this device.");
    await page.reload();
    await waitForApp(page, ".hymn-toolbar-instruments");
    await expect(sung).toHaveAttribute("aria-checked", "true");
    // The saved instrument also survives navigating to a clean song link.
    await page.goto(
      `${server.base}/piano/hymns/${stagedHymn.id}?mode=playback`,
    );
    await waitForApp(page, ".hymn-toolbar-instruments");
    await expect(sung).toHaveAttribute("aria-checked", "true");
    await selectHymnInstrument(page, "piano");
    await practiceOption(page, "#hymn-arrangement", "bass");
    await expect(piano).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#hymn-arrangement option")).toHaveCount(4);
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
  await page.goto(server.base + "/piano/hymns/in-christ-alone-2?mode=playback");
  await waitForApp(page, ".hymn-toolbar-instruments");
  await expect(
    page.getByRole("radio", { name: "Voice + Piano", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
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
  await page.goto(`${server.base}/piano/hymns/${guitarEditionHymn!.id}?arrangement=guitar-edition&display=both&mode=playback`);
  await waitForApp(page,".hymn-toolbar-instruments");
  await openPracticeOptions(page);
  const showTab=page.getByRole("checkbox",{name:"Show Tablature",exact:true});
  const showTreble=page.getByRole("checkbox",{name:"Show Treble",exact:true});
  const showChords=page.getByRole("checkbox",{name:"Show Chords",exact:true});
  await expect(page.getByRole("checkbox",{name:"Play Tablature",exact:true})).toBeDisabled();
  await expect(page.getByRole("checkbox",{name:"Play Chords",exact:true})).toBeDisabled();
  await showTab.uncheck();
  await expect(page.locator("[data-name=tabNumber]")).toHaveCount(0);
  await showTab.check();await showTreble.uncheck();
  await expect(page.locator("#hymn-score-display")).toHaveValue("tab");
  const frets=await page.locator("[data-name=tabNumber]").allTextContents();
  await showChords.uncheck();
  await expect(page.locator(".abcjs-chord")).toHaveCount(0);
  assert.deepEqual(await page.locator("[data-name=tabNumber]").allTextContents(),frets);
  await page.reload();await waitForApp(page,".hymn-toolbar-instruments");await openPracticeOptions(page);
  await expect(showChords).not.toBeChecked();await expect(showTreble).not.toBeChecked();await expect(showTab).toBeChecked();
  await expect(page.getByRole("checkbox",{name:"Play Treble",exact:true})).toBeChecked();
  await showTab.uncheck();await expect(page.locator(".hymn-paper svg:visible")).toHaveCount(0);
  await showTreble.check();await expect(page.locator(".hymn-paper svg:visible").first()).toBeVisible();
  await showChords.check();await dismissPracticeDrawer(page);
  await page.getByRole("button",{name:/^Show .* chord diagram$/}).first().click();
  const chordDialog=page.getByRole("dialog"),toneCount=await chordDialog.locator('[data-string]:not([data-fret="not-played"])').count();
  await page.evaluate(()=>{(window as any).chordPreviewAttacks=[];});
  await chordDialog.getByRole("button",{name:/^Play .* chord and breakdown$/}).click();
  await page.waitForFunction(count=>(window as any).chordPreviewAttacks.length===count*2,toneCount);
  const attacks=await page.evaluate(()=>(window as any).chordPreviewAttacks as number[]);
  assert(attacks.slice(0,toneCount).every(time=>time===attacks[0]));
  assert.deepEqual(attacks.slice(toneCount).map(time=>Math.round((time-attacks[0])*100)/100),Array.from({length:toneCount},(_,index)=>1+index*.5));
  await chordDialog.getByRole("button",{name:"Close chord diagram",exact:true}).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: primary instrument radios, supported choices, keyboard exclusivity, saved selection and responsive toolbar",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
