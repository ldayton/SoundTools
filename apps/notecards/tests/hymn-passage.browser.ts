import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import {
  practiceOption,
  closePracticeOptions,
  midiAction,
} from "./navigation-helpers";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const engine = process.env.TEST_BROWSER || "chromium";
const port = process.env.TEST_PORT || "4378";
const base = `http://127.0.0.1:${port}`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const fixed = await mkdtemp(join(tmpdir(), "hymn-playback-"));
const browser = await { chromium, firefox, webkit }[engine]!.launch({
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript({
    content: await readFile(
      new URL("./fixtures/midi.js", import.meta.url),
      "utf8",
    ),
  });
  await page.addInitScript(() => {
    const probe = ((window as any).playbackProbe = {
      starts: [] as number[],
      stops: 0,
      clicks: [] as number[],
    });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      probe.starts.push(args[0] || 0);
      return start.apply(this, args);
    };
    const click = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (
      ...args: Parameters<typeof click>
    ) {
      probe.clicks.push(args[0] || 0);
      return click.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (
      ...args: Parameters<typeof stop>
    ) {
      probe.stops++;
      return stop.apply(this, args);
    };
  });
  await page.goto(
    base +
      "/piano/hymns/amazing-grace?bars=0&mode=wait&countIn=0&tempo=200&arrangement=melody",
  );
  await page.locator(".hymn-paper svg").first().waitFor();
  await midiAction(page, "Connect MIDI keyboard");
  const note = (i: number) =>
    page.locator(`[data-passage-note="${i}"]`).first();
  const center = async (i: number) => {
    await note(i).scrollIntoViewIfNeeded();
    const b = (await note(i).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const select = async (a: number, b: number) => {
    await page
      .getByRole("button", { name: "Select passage", exact: true })
      .click();
    const from = await center(a);
    await page.mouse.click(from.x, from.y);
    const to = await center(b);
    await page.mouse.click(to.x, to.y);
  };
  await select(1, 2);
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–3 selected/,
  );
  assert.match((await page.locator(".hymn-count").textContent())!, /1 \/ 2/);
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  // Amazing Grace in G: the selected two melody attacks are G4, B4.
  const send = async (n: number) =>
    page.evaluate((pitch) => {
      (window as any).midiTest.send([0x90, pitch, 100]);
      (window as any).midiTest.send([0x80, pitch, 0]);
    }, n);
  await send(67);
  assert.match((await page.locator(".hymn-count").textContent())!, /2 \/ 2/);
  await send(71);
  assert.match(
    (await page.locator(".hymn-count").textContent())!,
    /1 \/ 2/,
    "wait mode loops only the selection",
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(150);
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–3 selected/,
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  assert.equal(await page.locator(".hymn-loop").isVisible(), false);
  await page
    .getByRole("button", { name: "Select passage", exact: true })
    .click();
  const a = await center(1),
    b = await center(3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–4 selected/,
  );
  await practiceOption(page, "#hymn-mode", "playback");
  await practiceOption(page, "#hymn-count-in", "0");
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    () => (window as any).playbackProbe.starts.length >= 6,
  );
  assert.equal(await page.locator("#hymn-section").inputValue(), "0");
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–4 selected/,
  );
  await page.getByRole("checkbox", { name: "Loop", exact: true }).uncheck();
  await page.waitForFunction(
    () => document.querySelector(".hymn-count")?.textContent === "Complete",
  );
  await page
    .getByRole("button", { name: "Select passage", exact: true })
    .click();
  const first = await center(0);
  await page.mouse.click(first.x, first.y);
  await page.getByRole("button", { name: "Cancel selection" }).click();
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–4 selected/,
    "cancel leaves the previous passage intact",
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await select(2, 1);
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–3 selected/,
    "tap selection works in either order on narrow screens",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: `/tmp/hymn-passage-${engine}.png` });
  await practiceOption(page, "#hymn-length", "2");
  assert.equal(
    await page.locator(".hymn-clear-passage").isVisible(),
    false,
    "changing the score clears stale ranges",
  );
  await practiceOption(page, "#hymn-section", "0");
  const last = await page
    .locator("[data-passage-note]")
    .evaluateAll((nodes) =>
      Math.max(
        ...nodes.map((n) => Number(n.getAttribute("data-passage-note"))),
      ),
    );
  await select(last, last);
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  const before = await page.evaluate(
    () => (window as any).playbackProbe.starts.length,
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    (n) => (window as any).playbackProbe.starts.length >= n + 3,
    before,
  );
  assert.equal(
    await page.locator("#hymn-section").inputValue(),
    "0",
    "a loop ending at the section boundary never escapes to the next section",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const stoppedAt = await page.evaluate(
    () => (window as any).playbackProbe.starts.length,
  );
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => (window as any).playbackProbe.starts.length),
    stoppedAt,
    "pausing cancels loop restarts",
  );
  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(
    base +
      "/piano/hymns/amazing-grace?bars=0&mode=wait&countIn=0&arrangement=melody",
  );
  await touch
    .getByRole("button", { name: "Select passage", exact: true })
    .click();
  for (const i of [1, 2]) {
    const target = touch.locator(`[data-passage-note="${i}"]`).first();
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await touch.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  assert.match(
    (await touch.locator(".hymn-passage-status").textContent())!,
    /Notes 2–3 selected/,
    "real touch pointer events select a passage",
  );
  await touch.screenshot({ path: `/tmp/hymn-passage-touch-${engine}.png` });
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: passage mouse drag, tap selection, wait and playback loops, cancellation and responsive layout passed`,
  );
} finally {
  await browser.close();
  server.kill();
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
