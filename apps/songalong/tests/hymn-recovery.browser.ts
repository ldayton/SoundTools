import {
  recoveryHymn,
  recoveryMelody,
  recoveryBass,
  recoveryLeftPitches,
  pianoTieFixture,
} from "../../../packages/music-practice/test-fixtures/hymns";
const [first, second, third] = recoveryMelody;
const wrong = second + 1;
import {
  waitForServer,
  captureFailure,
  closeBrowser,
  launchBrowser,
  createContext,
} from "../../../scripts/ci/browser-harness.cjs";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  midiAction,
  openPracticeOptions,
} from "../../../packages/music-practice/browser-tests/helpers";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:4358";
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [
        vite,
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "4358",
        "--strictPort",
      ],
      { stdio: "ignore" },
    );
const fixed = await mkdtemp(join(tmpdir(), "hymn-recovery-"));
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  try {
    const context = await createContext(browser, {
      viewport: { width: 1400, height: 1000 },
    });
    await context.addInitScript({
      content: await readFile(
        new URL(
          "../../../packages/music-practice/test-fixtures/midi.js",
          import.meta.url,
        ),
        "utf8",
      ),
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      base +
        `/piano/hymns/${recoveryHymn.slug}?arrangement=piano&hands=both&view=both&mode=wait&key=original`,
    );
    await page.locator(".hymn-count").filter({ hasText: "1 /" }).waitFor();
    await openPracticeOptions(page);
    assert.equal(await page.locator("#hymn-view").count(),0,"Instrument scores retain both printed hands");
    const ties=page.getByRole("checkbox",{name:"Re-strike tied notes",exact:true});
    assert.equal(await ties.isChecked(),false);
    await midiAction(page, "Connect MIDI keyboard");
    await page
      .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
      .waitFor({ state: "attached" });
    const send = (n: number, on = true) =>
      page.evaluate(
        ({ n, on }) =>
          (window as any).midiTest.send([on ? 0x90 : 0x80, n, on ? 100 : 0]),
        { n, on },
      );
    const note = async (n: number) => {
      await send(n);
      await send(n, false);
    };
    const step = async () =>
      Number(
        (await page.locator(".hymn-count").textContent())?.split(" / ")[0],
      );
    for(const p of recoveryLeftPitches) await send(p);
    await note(first);
    assert.equal(await step(), 2);
    await note(wrong);
    assert.equal(await step(), 2);
    for(const p of recoveryLeftPitches) await send(p,false);
    await send(second);
    assert.equal(
      await step(),
      2,
      "the melody alone cannot finish a retry over carried bass",
    );
    assert.ok(
      await page
        .locator(`.hymn-piano [data-piano="${recoveryBass}"].is-right`)
        .count(),
    );
    for(const p of recoveryLeftPitches) await send(p);
    assert.equal(await step(), 3);
    await send(second, false);
    await note(third);
    assert.equal(
      await step(),
      4,
      "normal progress does not need another bass strike",
    );
    for(const p of recoveryLeftPitches) await send(p,false);
    // Independently exercise a real written tie on a supported Piano score.
    await page.goto(base+`/piano/hymns/${pianoTieFixture.hymn.slug}?arrangement=piano&hands=both&mode=wait&ties=repeat`);
    await openPracticeOptions(page);assert.equal(await ties.isChecked(),true);
    await midiAction(page,"Connect MIDI keyboard");
    const tieCount=await page.locator(".hymn-paper .abcjs-tie").count();assert(tieCount>0);
    let held:number[]=[];
    for(const entry of pianoTieFixture.steps.slice(0,pianoTieFixture.index)){
      for(const pitch of held)await send(pitch,false);
      for(const pitch of entry.pitches)await send(pitch);
      held=entry.pitches;
    }
    assert.equal(await step(),pianoTieFixture.index+1);
    for(const pitch of held)if(pitch!==pianoTieFixture.bass)await send(pitch,false);
    for(const pitch of pianoTieFixture.steps[pianoTieFixture.index].pitches)if(pitch!==pianoTieFixture.bass)await send(pitch);
    assert.equal(await step(),pianoTieFixture.index+1,"The written continuation needs a fresh bass attack");
    await send(pianoTieFixture.bass,false);await send(pianoTieFixture.bass);
    assert.equal(await step(),pianoTieFixture.index+2);
    assert.equal(await page.locator(".hymn-paper .abcjs-tie").count(),tieCount);
    await page.goto(base+`/piano/hymns/${recoveryHymn.slug}?arrangement=piano&hands=right&mode=wait&ties=repeat`);
    await openPracticeOptions(page);
    await midiAction(page,"Connect MIDI keyboard");
    await page
      .getByRole("combobox", { name: "Practise hands", exact: true })
      .selectOption("right");
    await note(first);
    assert.equal(await step(), 2);
    await note(wrong);
    await note(second);
    assert.equal(
      await step(),
      3,
      "right-hand-only retry does not ask for the unpractised bass",
    );
    await page.reload();
    await openPracticeOptions(page);
    assert.equal(await ties.isChecked(), true);
    assert.equal(await page.locator("#hymn-hands").inputValue(), "right");
    await page.setViewportSize({ width: 900, height: 844 });
    await openPracticeOptions(page);
    const alignment = await ties.evaluate((el) => {
      const input = el.getBoundingClientRect();
      const label = document
        .querySelector(`label[for="${el.id}"]`)!
        .getBoundingClientRect();
      return {
        labelToRight: label.left >= input.right,
        verticallyAligned:
          Math.abs((label.top + label.bottom - input.top - input.bottom) / 2) <
          2,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.deepEqual(alignment, {
      labelToRight: true,
      verticallyAligned: true,
      overflow: false,
    });
    await page.screenshot({ path: "/tmp/hymn-recovery-narrow-desktop.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: hand controls share a row; MIDI retries recover sustained bass; optional tied attacks preserve engraving; single-hand scope, persistence and narrow desktop checkbox alignment",
    );
  } finally {
    await closeBrowser(browser);
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (error: NodeJS.ErrnoException) => {
      // macOS can protect browser-created Downloads after the browser exits.
      if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
    },
  );
}
