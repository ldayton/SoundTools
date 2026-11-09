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
  await page.locator('[data-letter="E"]:enabled').waitFor();
  await page.locator("#mode").selectOption("sight");
  await page.locator("#hymn-key").waitFor();
  await page.locator("#hymn-length").selectOption("0");
  assert.equal(await page.locator("#hymn-key").inputValue(), "original");
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor();
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
  await page.locator("#hymn-key").selectOption("A");
  assert.equal(await count(), "1 / 35");
  await note(62);
  assert.match(
    (await page.locator(".hymn-feedback").textContent())!,
    /play E4/,
  );
  assert.equal(await count(), "1 / 35");
  await note(64);
  await note(69);
  assert.equal(await count(), "3 / 35");
  await saved();
  await page.reload();
  await page.locator(".hymn-count").filter({ hasText: "3 / 35" }).waitFor();
  assert.equal(await page.locator("#hymn-key").inputValue(), "A");
  await page.locator("#hymn-key").selectOption("original");
  assert.equal(await count(), "2 / 35");
  await page.locator("#hymn-key").selectOption("G");
  assert.equal(
    await count(),
    "2 / 35",
    "source tonic shares original progress",
  );
  await page.locator("#hymn-key").selectOption("A");
  assert.equal(await count(), "3 / 35");
  await page.locator("#hymn-key").selectOption("original");
  await page.locator("#hymn-arrangement").selectOption("original");
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor();
  await send(43);
  await send(55);
  assert.equal(await count(), "1 / 35");
  await page.locator("#hymn-key").selectOption("A");
  assert.equal(await count(), "1 / 35");
  assert.equal(
    await page.locator(".hymn-feedback").getAttribute("data-kind"),
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
    await page.locator("#hymn-arrangement").selectOption(arrangement);
    const noteCount = await page.locator(".hymn-paper .abcjs-note").count();
    const words = (
      await page.locator(".hymn-paper .abcjs-lyric").allTextContents()
    )
      .join("")
      .replace(/\s/g, "");
    for (const key of ["Bb", "F#"]) {
      await page.locator("#hymn-key").selectOption(key);
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
        (await page.locator(".hymn-feedback").textContent())!,
        /couldn’t/,
      );
    }
  }
  await note(62);
  assert.match(
    (await page.locator(".hymn-feedback").textContent())!,
    /C♯4/,
    "feedback uses the transposed sharp spelling",
  );
  await page.locator("#hymn-key").selectOption("F");
  await page.locator("#hymn-length").selectOption("2");
  await page.locator("#hymn-section").selectOption("1");
  await saved();
  await page.reload();
  await page.locator("#hymn-key").waitFor();
  assert.equal(await page.locator("#hymn-key").inputValue(), "F");
  assert.equal(await page.locator("#hymn-section").inputValue(), "1");
  await page.locator("#hymn-length").selectOption("0");
  await page.locator(".hymn-keyboard-toggle").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert.ok(
    await page.locator(".hymn-range-hint").isVisible(),
    "low transposed bass has honest MIDI-only guidance",
  );
  assert.match((await page.locator(".hymn-range-hint").textContent())!, /F2/);
  const kb = await page.locator(".hymn-piano").boundingBox(),
    feedback = await page.locator(".hymn-feedback").boundingBox(),
    score = await page.locator(".hymn-score").boundingBox();
  assert.ok((await page.locator("#hymn-key").boundingBox())!.y < score!.y);
  assert.ok(score!.y < 400, "phone controls remain compact");
  assert.ok(feedback!.height <= 64);
  assert.ok(kb!.y - feedback!.y - feedback!.height < 20);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  // A pre-key version-1 activity defaults to Original and reuses its old bookmarks.
  await page.locator("#hymn-arrangement").selectOption("melody");
  await page.locator("#hymn-key").selectOption("original");
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
  await page.locator(".hymn-count").filter({ hasText: "2 / 35" }).waitFor();
  assert.equal(await page.locator("#hymn-key").inputValue(), "original");
  assert.deepEqual(errors, []);
  console.log(
    "Hymn keys: transposed grading/chords, independent bookmarks, reload, old state, sections, all arrangements and phone layout passed",
  );
} finally {
  await browser.close();
  server?.kill();
}
