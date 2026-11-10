import {
  selectPractice,
  practiceOption,
  midiAction,
  closePracticeOptions,
  setPianoVisible,
} from "./navigation-helpers";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
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
      { stdio: "ignore" },
    );
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const browser = await (
  { chromium, firefox, webkit }[process.env.TEST_BROWSER || "chromium"] ||
  chromium
).launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1000 },
  });
  await context.addInitScript({
    content: await readFile(
      new URL("./fixtures/midi.js", import.meta.url),
      "utf8",
    ),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .locator('[data-letter="E"]:enabled')
    .waitFor({ state: "attached" });
  await selectPractice(page, "sight");
  await page.locator("#hymn-key").waitFor({ state: "attached" });
  await practiceOption(page, "#hymn-length", "0");
  assert.equal(await page.locator("#hymn-key").inputValue(), "original");
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
  await note(62);
  assert.equal(await count(), "2 / 35");
  await practiceOption(page, "#hymn-key", "A");
  assert.equal(await count(), "1 / 35");
  await note(62);
  assert.match(
    (await page.locator(".sequence-feedback").textContent())!,
    /play E4/,
  );
  assert.equal(await count(), "1 / 35");
  await note(64);
  await note(69);
  assert.equal(await count(), "3 / 35");
  await saved();
  await page.reload();
  await page
    .locator(".hymn-count")
    .filter({ hasText: "3 / 35" })
    .waitFor({ state: "attached" });
  assert.equal(await page.locator("#hymn-key").inputValue(), "A");
  await practiceOption(page, "#hymn-key", "original");
  assert.equal(await count(), "2 / 35");
  await practiceOption(page, "#hymn-key", "G");
  assert.equal(
    await count(),
    "2 / 35",
    "source tonic shares original progress",
  );
  await practiceOption(page, "#hymn-key", "A");
  assert.equal(await count(), "3 / 35");
  await practiceOption(page, "#hymn-key", "original");
  await practiceOption(page, "#hymn-arrangement", "original");
  await midiAction(page, "Connect MIDI keyboard");
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor({ state: "attached" });
  await send(43);
  await send(55);
  assert.equal(await count(), "1 / 35");
  await practiceOption(page, "#hymn-key", "A");
  assert.equal(await count(), "1 / 35");
  assert.equal(
    await page.locator(".sequence-feedback").getAttribute("data-kind"),
    null,
    "old partial feedback is cleared",
  );
  for (const n of [43, 55]) await send(n, false);
  for (const n of [45, 57, 61]) await send(n);
  assert.equal(await count(), "1 / 35");
  await send(62);
  assert.equal(await count(), "1 / 35");
  await send(62, false);
  await send(64);
  assert.equal(await count(), "2 / 35");
  for (const n of [45, 57, 61, 64]) await send(n, false);
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
      assert.doesNotMatch(
        (await page.locator(".sequence-feedback").textContent())!,
        /couldn’t/,
      );
    }
  }
  await note(62);
  assert.match(
    (await page.locator(".sequence-feedback").textContent())!,
    /C♯4/,
    "feedback uses the transposed sharp spelling",
  );
  await practiceOption(page, "#hymn-key", "F");
  await practiceOption(page, "#hymn-length", "2");
  await practiceOption(page, "#hymn-section", "1");
  await saved();
  await page.reload();
  await page.locator("#hymn-key").waitFor({ state: "attached" });
  assert.equal(await page.locator("#hymn-key").inputValue(), "F");
  assert.equal(await page.locator("#hymn-section").inputValue(), "1");
  await practiceOption(page, "#hymn-length", "0");
  await closePracticeOptions(page);
  await setPianoVisible(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert.ok(
    await page.locator(".hymn-range-hint").isVisible(),
    "low transposed bass has honest MIDI-only guidance",
  );
  assert.match((await page.locator(".hymn-range-hint").textContent())!, /F2/);
  const kb = await page.locator(".hymn-piano").boundingBox(),
    feedback = await page.locator(".sequence-feedback").boundingBox(),
    score = await page.locator(".sequence-score").boundingBox();
  assert.ok(
    (await page.locator("#sight-reading .practice-options").boundingBox())!.y <
      score!.y,
  );
  assert.ok(score!.y < 400, "phone controls remain compact");
  assert.ok(feedback!.height <= 64);
  const scoreBox = (await page.locator(".sequence-score").boundingBox())!;
  assert.ok(feedback!.y + feedback!.height <= scoreBox.y);
  const transport = (await page
    .locator(".sequence-transport:visible")
    .boundingBox())!;
  assert.ok(kb!.y - transport.y - transport.height < 48);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  // A pre-key version-1 activity defaults to Original and reuses its old bookmarks.
  await practiceOption(page, "#hymn-arrangement", "melody");
  await practiceOption(page, "#hymn-key", "original");
  await saved();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("soundtools-notecards");
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
    .filter({ hasText: "2 / 35" })
    .waitFor({ state: "attached" });
  assert.equal(await page.locator("#hymn-key").inputValue(), "original");
  assert.deepEqual(errors, []);
  console.log(
    "Hymn keys: transposed grading/chords, independent bookmarks, reload, old state, sections, all arrangements and phone layout passed",
  );
} finally {
  await browser.close();
  server?.kill();
}
