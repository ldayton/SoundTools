import {
  recoveryHymn,
  recoveryMelody,
  playbackAttacks,
  selectStagedHymn,
} from "../../../packages/music-practice/test-fixtures/hymns";
import {
  spellPitch,
  chromaticPitch,
} from "../../../packages/music-practice/src/guitar";
import { name } from "../../../packages/music-practice/src/model";
const comparisonHymn = selectStagedHymn(undefined, {
  exclude: recoveryHymn.id,
});
const [first, second, third, fourth] = recoveryMelody;
const wrong = first - 1;
const chord = playbackAttacks("original", recoveryHymn)[0];
const sourceKey = recoveryHymn.melody.match(/^K:(\S+)/m)![1];
const pitchLabel = (pitch: number) => {
  const card = spellPitch(pitch, sourceKey) || chromaticPitch(pitch);
  return name(card) + card.octave;
};
import {
  waitForServer,
  captureFailure,
  closeBrowser,
  launchBrowser,
  createOfflineContext as createContext,
} from "../../../scripts/ci/browser-harness.cjs";
import {
  practiceOption,
  dismissPracticeDrawer,
  openNavigation,
  closeNavigation,
  selectPractice,
  midiAction,
  openPracticeOptions,
  setPianoVisible,
  closePracticeOptions,
} from "../../../packages/music-practice/browser-tests/helpers";
import { chromium, firefox, webkit } from "playwright";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const engine = process.env.TEST_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4341";
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}/`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
      { stdio: "ignore" },
    );
if (!process.env.TEST_BASE_URL) {
  const root = new URL("../dist/", import.meta.url);
  const pack = JSON.parse(
    await readFile(new URL("offline-pack.json", root), "utf8"),
  );
  for (const file of pack.files) {
    const bytes = await readFile(
      new URL(file.url === "/" ? "index.html" : file.url.slice(1), root),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      file.sha256,
      "Offline integrity: " + file.url,
    );
  }
}
const fixed = await mkdtemp(join(tmpdir(), "notecards-sight-"));
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const context = await createContext(browser, {
    viewport: { width: 1100, height: 1000 },
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
  await page.goto(base + `piano/hymns/${recoveryHymn.id}`);
  await page.locator(".hymn-paper svg").first().waitFor();

  await page.locator(".hymn-count").filter({ hasText: /\d/ }).waitFor();
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    `1 / ${recoveryMelody.length}`,
  );
  assert.equal(await page.evaluate(() => (window as any).midiTest.calls()), 0);
  const input = page.getByRole("combobox", { name: "Hymn", exact: true });
  const choose = async (title: string) => {
    const options = page.locator(".practice-options");
    await openPracticeOptions(page);
    await openNavigation(page);
    await input.click();
    await input.fill(title);
    await page.getByRole("option", { name: title, exact: true }).click();
    await closeNavigation(page);
    await page.locator(".sequence-title").filter({ hasText: title }).waitFor();
    assert.equal(await page.locator(".sequence-title").textContent(), title);
  };
  // A second search must replace the selected title, even while the input still has focus.
  await choose(recoveryHymn.title);
  await openNavigation(page);
  await input.click();
  await input.pressSequentially(
    comparisonHymn.title.split(" ")[0].toLowerCase(),
  );
  assert.equal(
    await input.inputValue(),
    comparisonHymn.title.split(" ")[0].toLowerCase(),
  );
  // Wait for the searchable Select to finish filtering and highlight its result.
  await page
    .getByRole("option", { name: comparisonHymn.title, exact: true })
    .and(page.locator("[data-combobox-selected]"))
    .waitFor();
  await input.press("Enter");
  await page
    .locator(".sequence-title")
    .filter({ hasText: comparisonHymn.title })
    .waitFor();
  assert.equal(
    await page.locator(".sequence-title").textContent(),
    comparisonHymn.title,
  );
  await choose(recoveryHymn.title);
  const send = async (data: number[], stale = false) =>
    page.evaluate(
      ({ data, stale }) =>
        (window as any).midiTest.send(
          data,
          "roland",
          stale ? 0 : performance.now(),
        ),
      { data, stale },
    );
  const on = (n: number) => send([0x90, n, 100]);
  const off = (n: number) => send([0x80, n, 0]);
  await midiAction(page, "Connect MIDI keyboard");
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor({ state: "attached" });
  await page.evaluate(() => {
    (window as any).routeWrites = 0;
    for (const method of ["pushState", "replaceState"] as const) {
      const write = history[method].bind(history);
      history[method] = (...args) => {
        (window as any).routeWrites++;
        return write(...args);
      };
    }
  });
  await on(wrong);
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    `1 / ${recoveryMelody.length}`,
  );
  assert.equal(
    await page
      .locator(`.piano-key.is-wrong[data-piano="${wrong}"] .piano-hint-label`)
      .textContent(),
    pitchLabel(wrong),
  );
  assert.equal(
    await page
      .locator(`.piano-key.is-right[data-piano="${first}"] .piano-hint-label`)
      .textContent(),
    pitchLabel(first),
  );
  await off(wrong);
  await send([0x90, first, 100], true);
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    `1 / ${recoveryMelody.length}`,
  );
  await off(first);
  await on(first);
  await on(second); // Legato: the D remains physically held.
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    `3 / ${recoveryMelody.length}`,
  );
  await page.locator(".hymn-pause").click();
  await on(third);
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    `3 / ${recoveryMelody.length}`,
  );
  await page.locator(".hymn-pause").click();
  await on(third);
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    `3 / ${recoveryMelody.length}`,
  );
  await off(third);
  await on(third);
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    `4 / ${recoveryMelody.length}`,
  );
  assert.equal(
    await page.evaluate(() => (window as any).routeWrites),
    0,
    "answering, pausing and resuming must not rewrite an unchanged hymn URL",
  );
  for (const n of [first, second, third]) await off(n);
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await page
    .locator(".hymn-count")
    .filter({ hasText: `4 / ${recoveryMelody.length}` })
    .waitFor();
  await setPianoVisible(page, true);
  await page.locator(`.hymn-piano [data-piano="${fourth}"]`).click();
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    `5 / ${recoveryMelody.length}`,
  );
  await practiceOption(page, "#hymn-arrangement", "original");
  const initial = await page.locator(".hymn-count").textContent();
  assert.match(initial!, /^1 \/ /);
  await midiAction(page, "Connect MIDI keyboard");
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor({ state: "attached" });
  for (const n of chord.slice(0, -1)) await on(n);
  assert.equal(await page.locator(".hymn-count").textContent(), initial);
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.waitForTimeout(200);
  await on(chord.at(-1)!);
  assert.match((await page.locator(".hymn-count").textContent())!, /^2 \/ /);
  for (const n of chord) await off(n);
  // Expand the keyboard viewport before entering this wide bass-to-treble chord.
  // Keys retain their fixed width when the options sidebar is open.
  await closePracticeOptions(page);
  await page.locator(".hymn-go-start").click();
  for (const n of chord) {
    const key = page.locator(`.hymn-piano [data-piano="${n}"]`);
    const box = await key.boundingBox();
    await key.click({ position: { x: box!.width / 2, y: box!.height * 0.85 } });
  }
  assert.match((await page.locator(".hymn-count").textContent())!, /^2 \/ /);
  assert.equal(await page.locator(".sight-key-selected").count(), 0);
  // The exhaustive catalog matrix runs independently in hymn-catalog.browser.ts.
  await page.setViewportSize({ width: 320, height: 1000 });
  await openNavigation(page);
  await input.click();
  await input.fill("zzzzzz");
  await page.getByText("No hymns found. Try another title.").waitFor();
  await input.press("Escape");
  assert.equal(await input.inputValue(), "");
  await openNavigation(page);
  await input.click();
  await input.fill("First Fingerstyle Blues");
  await input.press("Enter");
  assert.equal(
    await page.locator(".sequence-title").textContent(),
    "1st Fingerstyle Blues",
  );
  await choose(recoveryHymn.title);
  await practiceOption(page, "#hymn-arrangement", "melody");
  await setPianoVisible(page, false); // keep the review screenshot focused on the score
  await mkdir("work", { recursive: true });
  await page.screenshot({
    path: `work/sight-reading-${engine}-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.screenshot({
    path: `work/sight-reading-${engine}-desktop.png`,
    fullPage: true,
  });
  // Complete the selected melody, including tied notes.
  const sequence = recoveryMelody;
  await page.locator(".hymn-go-start").click();
  await midiAction(page, "Connect MIDI keyboard");
  await closeNavigation(page);
  for (const n of sequence) {
    await on(n);
    await off(n);
  }
  assert.equal(await page.locator(".hymn-count").textContent(), "Complete");
  assert.equal(await page.locator(".hymn-next").count(), 0);
  await choose(comparisonHymn.title);
  assert.equal(
    await page.locator(".sequence-title").textContent(),
    comparisonHymn.title,
  );
  // New feature and its entire library are available offline, including lazy-loaded code.
  if (!process.env.TEST_BASE_URL) {
    await page.waitForFunction(
      () =>
        document.querySelector("#offline-status")?.textContent ===
        "Available offline",
    );
    await context.setOffline(true);
    await page.reload();
    await page
      .locator(".sequence-title")
      .filter({ hasText: comparisonHymn.title })
      .waitFor();
    await choose(recoveryHymn.title);
    assert.equal(
      await page.locator(".hymn-count").textContent(),
      "Complete",
      "completed bookmark survives offline reload",
    );
    await page.locator(".hymn-go-start").click();
    assert.equal(
      await page.locator(".hymn-count").textContent(),
      `1 / ${recoveryMelody.length}`,
    );
    await context.setOffline(false);
    // A fresh tab can enter hymns for the first time offline: not merely reuse an in-memory module.
    const cold = await createContext(browser);
    const firstUse = await cold.newPage();
    await firstUse.goto(base);
    await firstUse.waitForFunction(
      () =>
        document.querySelector("#offline-status")?.textContent ===
        "Available offline",
    );
    await cold.setOffline(true);
    await firstUse.goto(base + `piano/hymns/${recoveryHymn.id}`);
    await firstUse.locator(".hymn-count").filter({ hasText: /\d/ }).waitFor();
    await firstUse
      .locator(".hymn-count")
      .filter({ hasText: `1 / ${recoveryMelody.length}` })
      .waitFor();
    await cold.close();
    await page.bringToFront();
  }
  await setPianoVisible(page, false);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  assert.ok(await page.locator("#sight-reading").isHidden());
  await page
    .getByLabel("Share diagnostic information", { exact: true })
    .waitFor();
  await page.getByRole("link", { name: "SongAlong home", exact: true }).click();
  assert.equal(
    await page.locator(".piano-toggle:visible").getAttribute("aria-expanded"),
    "false",
    "piano visibility survives a settings visit",
  );
  await setPianoVisible(page, true);
  await page.locator(".hymn-piano [data-piano]").first().waitFor();
  await openNavigation(page);
  assert.ok(await page.locator(".keyboard-menu").isVisible());
  await closeNavigation(page);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: hymn search, MIDI legato/chords, pause, reload, completion and offline passed.`,
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (error: NodeJS.ErrnoException) => {
      // macOS can protect the browser-created Downloads directory even after exit.
      if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
    },
  );
}
