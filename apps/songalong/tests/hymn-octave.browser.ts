import { waitForServer, captureFailure, closeBrowser, launchBrowser, newPage } from '../../../scripts/ci/browser-harness.cjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import {
  openPracticeOptions,
  closePracticeOptions,
  practiceOption,
  midiAction,
  setPianoVisible,
} from "../../../packages/music-practice/browser-tests/helpers";

const engine = process.env.TEST_BROWSER || "chromium";
const port = process.env.TEST_PORT || "4385";
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package.json$/, "bin/vite.js");
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
      { stdio: "ignore" },
    );
const home = await mkdtemp(join(tmpdir(), "songalong-octaves-"));
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser({
    args: engine === "chromium" ? ["--mute-audio"] : [],
    env: { ...process.env, CFFIXED_USER_HOME: home },
  });
  const page = await newPage(browser, {
    viewport: { width: 1680, height: 1050 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript({
    content: await readFile(
      new URL(
        "../../../packages/music-practice/test-fixtures/midi.js",
        import.meta.url,
      ),
      "utf8",
    ),
  });
  // Exercise actual playback clocks without sending sound to the computer.
  await page.addInitScript(() => {
    const connect: Function = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (args[0] === this.context.destination) {
        const mute = this.context.createGain();
        mute.gain.value = 0;
        connect.call(mute, this.context.destination);
        return connect.call(this, mute);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  await page.goto(base + "/piano/hymns/amazing-grace?key=B&low=38&high=91");
  const range = page.locator(".hymn-key-range");
  await range.filter({ hasText: "F♯2–F♯3" }).waitFor();
  assert.ok((await page.locator(".hymn-ottava").count()) > 0);
  assert.ok(
    (await page.locator(".hymn-ottava").allTextContents()).every(
      (text) => text === "15",
    ),
  );
  assert.equal(await page.locator('input[name="hymn-key"]').inputValue(), "B");
  assert.ok(await page.locator("#hymn-octave-down").isDisabled());
  const shift = async (direction: "up" | "down") => {
    await openPracticeOptions(page);
    await page.locator(`#hymn-octave-${direction}`).click();
  };
  await shift("up");
  assert.equal(await range.textContent(), "F♯3–F♯4");
  assert.ok(
    (await page.locator(".hymn-ottava").allTextContents()).every(
      (text) => text === "8",
    ),
  );
  assert.equal(await page.locator(".hymn-paper .abcjs-ledger").count(), 0);
  await shift("up");
  assert.equal(await range.textContent(), "F♯4–F♯5");
  await shift("up");
  assert.equal(await range.textContent(), "F♯5–F♯6");
  assert.ok(await page.locator("#hymn-octave-up").isDisabled());
  await shift("down");
  await shift("down");
  await page
    .locator("#saved")
    .filter({ hasText: "Saved on this device." })
    .waitFor();
  await page.reload();
  await range.filter({ hasText: "F♯3–F♯4" }).waitFor();
  await midiAction(page, "Connect MIDI keyboard");
  const note = async (n: number) =>
    page.evaluate((n) => {
      (window as any).midiTest.send([0x90, n, 100]);
      (window as any).midiTest.send([0x80, n, 0]);
    }, n);
  await note(66);
  assert.equal(await page.locator(".hymn-count").textContent(), "1 / 35");
  await note(54);
  assert.equal(await page.locator(".hymn-count").textContent(), "2 / 35");
  await shift("down");
  assert.equal(await page.locator(".hymn-count").textContent(), "1 / 35");
  await shift("up");
  assert.equal(await page.locator(".hymn-count").textContent(), "2 / 35");
  await practiceOption(page, "#hymn-mode", "playback");
  assert.equal(
    await range.textContent(),
    "F♯3–F♯4",
    "mode changes retain the chosen octave",
  );
  await closePracticeOptions(page);
  await setPianoVisible(page, true);
  await page.locator(".hymn-pause").click();
  await page.locator('.piano-key.is-playing[data-piano="54"]').waitFor();
  await page.locator(".hymn-pause").click();
  await page.setViewportSize({ width: 393, height: 852 });
  await openPracticeOptions(page);
  await page.locator("#hymn-octave-down").click();
  assert.equal(await range.textContent(), "F♯2–F♯3");
  assert.ok(await page.locator("#hymn-octave-down").isDisabled());
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: `work/hymn-octaves-mobile-${engine}.png`,
    fullPage: true,
  });
  // A key is still available when only a different octave fits the exact limits.
  await page.goto(base + "/piano/hymns/amazing-grace?key=B&low=42&high=54");
  await openPracticeOptions(page);
  await range.filter({ hasText: "F♯2–F♯3" }).waitFor();
  assert.ok(await page.locator("#hymn-octave-up").isDisabled());
  assert.ok(await page.locator("#hymn-octave-down").isDisabled());
  await page.goto(base + "/piano/hymns/amazing-grace?low=60&high=60");
  await page.locator(".hymn-no-key").waitFor();
  await openPracticeOptions(page);
  assert.ok(await page.locator("#hymn-octave-up").isDisabled());
  assert.ok(await page.locator("#hymn-octave-down").isDisabled());
  await page.goto(
    base +
      "/piano/hymns/amazing-grace?key=B&octave=-1&low=38&high=91&arrangement=bass&view=both",
  );
  await page.locator(".hymn-paper svg").first().waitFor();
  assert.ok((await page.locator(".hymn-ottava").count()) >= 2);
  assert.ok(
    (await page.locator(".hymn-ottava").allTextContents()).every(
      (text) => text === "8",
    ),
  );
  const systems = page.locator(".hymn-paper svg").filter({ has: page.locator(".abcjs-staff") });
  assert.ok(await systems.count() > 1, "the mobile hymn wraps across systems");
  assert.equal(await systems.first().locator(".abcjs-clef").count(), 2);
  assert.equal(await systems.first().locator(".abcjs-key-signature").count(), 2);
  for (let i = 1; i < await systems.count(); i++) {
    assert.equal(await systems.nth(i).locator(".abcjs-clef,.abcjs-key-signature,.abcjs-time-signature,.hymn-ottava").count(), 0,
      "later systems devote their width to the music");
  }
  assert.equal(
    await page.locator(".hymn-ottava path").count(),
    0,
    "No octave brackets",
  );
  assert.equal(
    await page.locator(".abcjs-clef .hymn-ottava").count(),
    await page.locator(".hymn-ottava").count(),
  );
  assert.equal(
    await page.locator(".hymn-ottava").count(),
    await page.locator(".abcjs-clef").count(),
    "Every displaced treble and bass clef is marked, including the first system",
  );
  assert.equal(
    await page.locator(".abcjs-note .hymn-ottava").count(),
    0,
    "clef marks never inflate selection hitboxes",
  );
  await page.setViewportSize({ width: 1680, height: 1050 });
  await openPracticeOptions(page);
  await page.screenshot({
    path: `work/hymn-ottava-desktop-${engine}.png`,
    fullPage: true,
  });
  const first = (await page
    .locator('[data-passage-note="0"]')
    .first()
    .boundingBox())!;
  const third = (await page
    .locator('[data-passage-note="2"]')
    .first()
    .boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  assert.equal(
    await page
      .getByRole("slider", { name: "Selection start", exact: true })
      .getAttribute("aria-valuenow"),
    "1",
  );
  assert.equal(
    await page
      .getByRole("slider", { name: "Selection end", exact: true })
      .getAttribute("aria-valuenow"),
    "3",
  );
  await page.locator(".hymn-clear-passage").click();
  await page.setViewportSize({ width: 393, height: 852 });
  await closePracticeOptions(page);
  await page.waitForFunction(() =>
    [...document.querySelectorAll<SVGGraphicsElement>(".hymn-ottava")].every(
      (mark) => {
        const box = mark.getBoundingClientRect(),
          svg = mark.closest("svg")!.getBoundingClientRect();
        return (
          box.left >= svg.left - 1 &&
          box.right <= svg.right + 1 &&
          box.top >= svg.top - 1 &&
          box.bottom <= svg.bottom + 1
        );
      },
    ),
  );
  await page.screenshot({
    path: `work/hymn-ottava-mobile-${engine}.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: octave limits/default, transpose, reload, MIDI grading, independent progress, playback animation and mobile controls passed`,
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server?.kill();
  await rm(home, { recursive: true, force: true }).catch(() => {});
}
