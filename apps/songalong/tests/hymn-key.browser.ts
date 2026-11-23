import { selectedHymnRange } from "../../../packages/music-practice/browser-tests/helpers";
import {
  playbackHymn,
  playbackAttacks,
  playbackRangeLabel,
  playbackSourceKey,
} from "../../../packages/music-practice/test-fixtures/hymns";
import { hymnTransposition } from "../../../packages/music-practice/src/hymn-transpose";
import {
  spellPitch,
  chromaticPitch,
} from "../../../packages/music-practice/src/guitar";
import { name } from "../../../packages/music-practice/src/model";
const melody = playbackAttacks();
const harmony = playbackAttacks("original");
const shift = hymnTransposition(playbackSourceKey, "A").semitones;
const first = melody[0][0];
const target = first + shift;
const targetChord = harmony[0].map((pitch) => pitch + shift);
const pitchLabel = (pitch: number, key: string) => {
  const card = spellPitch(pitch, key) || chromaticPitch(pitch);
  return name(card) + card.octave;
};
import {
  captureFailure,
  closeBrowser,
  launchBrowser,
  createContext,
} from "../../../scripts/ci/browser-harness.cjs";
import {
  selectPractice,
  practiceOption,
  openPracticeOptions,
  midiAction,
  closePracticeOptions,
  closeNavigation,
  setPianoVisible,
} from "../../../packages/music-practice/browser-tests/helpers";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:4348";
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
        "4348",
        "--strictPort",
      ],
      { stdio: "ignore", cwd: new URL("../", import.meta.url) },
    );
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const home = await mkdtemp(join(tmpdir(), "songalong-keys-"));
const browser = await launchBrowser({
  env: { ...process.env, CFFIXED_USER_HOME: home },
});
try {
  const context = await createContext(browser, {
    viewport: { width: 1680, height: 1000 },
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
  await page.goto(base + `/piano/hymns/${playbackHymn.id}`);
  await page.locator(".hymn-paper svg").first().waitFor({ state: "attached" });

  await page.locator("#hymn-key").waitFor({ state: "attached" });
  assert.equal(
    await page.locator('input[name="hymn-key"]').inputValue(),
    "original",
  );
  assert.equal(
    await selectedHymnRange(page),
    playbackRangeLabel("original"),
  );
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
  const count = () => page.locator(".hymn-count").textContent();
  const saved = () =>
    page.waitForFunction(
      () =>
        document.querySelector("#saved")?.textContent ===
        "Saved on this device.",
    );
  await note(first);
  assert.equal(await count(), `2 / ${melody.length}`);
  await practiceOption(page, "#hymn-key", "A");
  assert.equal(await count(), `1 / ${melody.length}`);
  await note(first);
  assert.equal(await page.locator(".sequence-feedback").count(), 0);
  assert.equal(await count(), `1 / ${melody.length}`);
  assert.equal(
    await page
      .locator(`.piano-key.is-wrong[data-piano="${first}"] .piano-hint-label`)
      .textContent(),
    pitchLabel(first, playbackSourceKey),
  );
  assert.equal(
    await page
      .locator(`.piano-key.is-right[data-piano="${target}"] .piano-hint-label`)
      .textContent(),
    pitchLabel(target, "A"),
  );
  assert.equal(
    await page
      .locator(`.piano-key[data-piano="${target}"]`)
      .getAttribute("aria-disabled"),
    "false",
    "hints allow an immediate retry",
  );
  assert.equal(
    await selectedHymnRange(page),
    playbackRangeLabel("A"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".practice-piano").isVisible(), false);
  assert.equal(await page.locator(".piano-toggle").count(), 0);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.locator('#sight-reading[data-playback-only="false"]').waitFor();
  await midiAction(page, "Connect MIDI keyboard");
  await closeNavigation(page);
  await note(target);
  assert.equal(
    await page.locator(".piano-hint-label").count(),
    0,
    "new notes clear previous guesses",
  );
  await note(melody[1][0] + shift);
  assert.equal(await count(), `3 / ${melody.length}`);
  await saved();
  await page.reload();
  await page
    .locator(".hymn-count")
    .filter({ hasText: `3 / ${melody.length}` })
    .waitFor({ state: "attached" });
  assert.equal(await page.locator('input[name="hymn-key"]').inputValue(), "A");
  await practiceOption(page, "#hymn-key", "original");
  assert.equal(await count(), `2 / ${melody.length}`);
  await practiceOption(page, "#hymn-key", playbackSourceKey);
  assert.equal(
    await count(),
    `2 / ${melody.length}`,
    "source tonic shares original progress",
  );
  await practiceOption(page, "#hymn-key", "A");
  assert.equal(await count(), `3 / ${melody.length}`);
  await practiceOption(page, "#hymn-key", "original");
  await practiceOption(page, "#hymn-arrangement", "original");
  await midiAction(page, "Connect MIDI keyboard");
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor();
  assert.ok(
    harmony[0].length >= 3,
    "fixture exercises a genuinely partial chord",
  );
  for (const pitch of harmony[0].slice(0, 2)) await send(pitch);
  assert.equal(await count(), `1 / ${harmony.length}`);
  await practiceOption(page, "#hymn-key", "A");
  assert.equal(await count(), `1 / ${harmony.length}`);
  assert.equal(
    await page.locator(".hymn-piano .is-wrong").count(),
    0,
    "old partial feedback is cleared",
  );
  for (const pitch of harmony[0].slice(0, 2)) await send(pitch, false);
  for (const pitch of targetChord.slice(0, -1)) await send(pitch);
  assert.equal(await count(), `1 / ${harmony.length}`);
  const wrong = targetChord.at(-1)! + 1;
  assert.ok(!targetChord.includes(wrong));
  await send(wrong);
  assert.equal(await count(), `1 / ${harmony.length}`);
  await send(wrong, false);
  await send(targetChord.at(-1)!);
  assert.equal(
    await count(),
    `1 / ${harmony.length}`,
    "a wrong note clears the partial chord",
  );
  for (const pitch of targetChord) await send(pitch, false);
  for (const pitch of targetChord) await send(pitch);
  assert.equal(await count(), `2 / ${harmony.length}`);
  for (const pitch of targetChord) await send(pitch, false);
  // Every arrangement renders in flat and sharp keys, with the same responsive controls.
  for (const arrangement of [
    "melody",
    "bass",
    "chords",
    "broken",
    "original",
  ]) {
    await practiceOption(page, "#hymn-arrangement", arrangement);
    const noteCount = await page.locator(".hymn-paper .abcjs-note").count();
    const words = (
      await page.locator(".hymn-paper .abcjs-lyric").allTextContents()
    )
      .join("")
      .replace(/\s/g, "");
    for (const key of ["Bb", "F#"]) {
      await practiceOption(page, "#hymn-key", key);
      assert.equal(
        await selectedHymnRange(page),
        playbackRangeLabel(key as "Bb" | "F#"),
        `${arrangement} reports melody only, even with harmony visible`,
      );
      assert.ok((await page.locator(".hymn-paper .sight-current").count()) > 0);
      assert.equal(
        await page.locator(".hymn-paper .abcjs-note").count(),
        noteCount,
      );
      assert.equal(
        (await page.locator(".hymn-paper .abcjs-lyric").allTextContents())
          .join("")
          .replace(/\s/g, ""),
        words,
      );
      assert.equal(await page.locator(".sequence-feedback.error").count(), 0);
    }
  }
  await practiceOption(page, "#hymn-arrangement", "melody");
  await note(first);
  assert.match(
    (
      await page
        .locator(".piano-key.is-right .piano-hint-label")
        .allTextContents()
    ).join(" "),
    new RegExp(
      pitchLabel(
        first + hymnTransposition(playbackSourceKey, "F#").semitones,
        "F#",
      ),
    ),
    "feedback uses the transposed sharp spelling",
  );
  await practiceOption(page, "#hymn-key", "Db");
  assert.equal(
    await selectedHymnRange(page),
    playbackRangeLabel("Db"),
  );
  await practiceOption(page, "#hymn-key", "B");
  assert.equal(
    await selectedHymnRange(page),
    playbackRangeLabel("B"),
  );
  await practiceOption(page, "#hymn-key", "F");
  await practiceOption(page, "#hymn-arrangement", "original");
  await page.locator("#hymn-octave-down").click();
  await page.locator("#hymn-octave-down").click();
  await saved();
  await page.reload();
  await page.locator("#hymn-key").waitFor({ state: "attached" });
  assert.equal(await page.locator('input[name="hymn-key"]').inputValue(), "F");
  assert.equal(await page.locator("#hymn-section").count(), 0);
  await closePracticeOptions(page);
  await setPianoVisible(page, true);
  await page.setViewportSize({ width: 900, height: 844 });
  await page.waitForTimeout(250);
  assert.ok(
    await page.locator(".hymn-range-hint").isVisible(),
    "low transposed bass has honest MIDI-only guidance",
  );
  assert.match(
    (await page.locator(".hymn-range-hint").textContent())!,
    new RegExp(
      pitchLabel(
        harmony[0][0] +
          hymnTransposition(playbackSourceKey, "F").semitones -
          24,
        "F",
      ),
    ),
  );
  const kb = await page.locator(".hymn-piano").boundingBox(),
    score = await page.locator(".sequence-score").boundingBox();
  assert.ok(
    (await page
      .getByRole("button", {
        name: /^(Expand|Collapse) (practice|playback) options$/,
      })
      .boundingBox())!.y < score!.y,
  );
  assert.ok(score!.y < 400, "narrow desktop controls remain compact");
  const scoreBox = (await page.locator(".sequence-score").boundingBox())!;
  assert.equal(
    await page.locator("#sight-reading .presentation-feedback").count(),
    0,
  );
  const transport = (await page
    .locator(".sequence-transport:visible")
    .boundingBox())!;
  assert.ok(
    transport.y + transport.height <= scoreBox.y,
    "Transport is above the score",
  );
  assert.ok(
    kb!.y - scoreBox.y - scoreBox.height < 48,
    "Piano stays close below the score",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await openPracticeOptions(page);
  await page.locator("#hymn-octave-up").click();
  await page.locator("#hymn-octave-up").click();
  // A pre-key version-1 activity defaults to Original and reuses its old bookmarks.
  await practiceOption(page, "#hymn-arrangement", "melody");
  await practiceOption(page, "#hymn-key", "original");
  await saved();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("soundtools-songalong");
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("state", "readwrite");
          const st = tx.objectStore("state");
          const q = st.get("root");
          q.onsuccess = () => {
            delete q.result.state.activities.sight.key;
            st.put(q.result, "root");
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page
    .locator(".hymn-count")
    .filter({ hasText: `2 / ${melody.length}` })
    .waitFor({ state: "attached" });
  await openPracticeOptions(page);
  assert.equal(
    await page.locator('input[name="hymn-key"]').inputValue(),
    "original",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Hymn keys: transposed grading/chords, independent bookmarks, reload, old state, sections, all arrangements and phone layout passed",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  await rm(home, { recursive: true, force: true }).catch((e) => {
    if (!["EACCES", "EPERM"].includes(e.code)) throw e;
  });
  server?.kill();
}
